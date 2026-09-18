import UIKit
import Network

/// The app's native shell.
///
/// ARCHITECTURE
/// ------------
/// One native container, one native tab bar, and exactly ONE web view that is
/// never torn down or reloaded while the app is running.
///
/// Selecting a tab does not load a page. It calls
/// `NovaraNative.navigate(path)` in the already-running single-page app, which
/// is the same client-side route change the web nav performed. That is what
/// makes the tab bar instant and, more importantly, what makes it safe: the
/// Clerk session, the React Query cache and any half-typed form all live in
/// that one web view and none of them are disturbed.
///
/// The native layer owns: the tab bar, the launch/offline/failure states, the
/// contact picker, the card scanner, haptics and the status bar. The web app
/// keeps owning every screen's content, which is exactly the split we want —
/// nothing about Novara's design, colour-coded relationship system or
/// behaviour changes.
final class NovaraRootViewController: UIViewController {

    private let webController = NovaraWebViewController()
    private let tabBar = UITabBar()
    private let launchStateView = NovaraLaunchStateView()
    private let connectionBanner = NovaraConnectionBanner()

    private var tabBarBottomConstraint: NSLayoutConstraint?
    private var webBottomToTabBar: NSLayoutConstraint?
    private var webBottomToView: NSLayoutConstraint?

    private var currentSection: NovaraSection?
    /// The last path visited in each section, so switching away and back
    /// returns you where you were — the behaviour a native tab bar implies.
    private var lastPath: [NovaraSection: String] = [:]

    private let pathMonitor = NWPathMonitor()
    private let pathMonitorQueue = DispatchQueue(label: "group.novaraconnect.app.network")
    private var isOnline = true
    private var offlineDebounce: DispatchWorkItem?
    private var foregroundObserver: NSObjectProtocol?
    private var didFinishFirstLoad = false
    private var launchWatchdog: DispatchWorkItem?

    private let selectionFeedback = UISelectionFeedbackGenerator()
    private let notificationFeedback = UINotificationFeedbackGenerator()

    private var contactImport: NovaraContactImport?
    private var cardScanner: NovaraCardScanner?

    /// How long to wait for the web app to report itself before assuming
    /// something is wrong. Generous: a cold launch on a slow connection is not
    /// a failure.
    private static let launchTimeout: TimeInterval = 15

    /// How long a connection has to stay down before the banner appears.
    private static let offlineGracePeriod: TimeInterval = 2.5

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = NovaraTheme.background

        webController.novaraDelegate = self
        addChild(webController)
        webController.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webController.view)
        webController.didMove(toParent: self)

        configureTabBar()
        configureOverlays()
        configureConstraints()
        startNetworkMonitoring()
        startLaunchWatchdog()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        launchWatchdog?.cancel()
    }

    deinit {
        pathMonitor.cancel()
        launchWatchdog?.cancel()
        offlineDebounce?.cancel()
        if let observer = foregroundObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    /// Keep the status bar exactly as Capacitor already decided it should be.
    override var childForStatusBarStyle: UIViewController? { webController }
    override var childForStatusBarHidden: UIViewController? { webController }

    // MARK: - Setup

    private func configureTabBar() {
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.delegate = self
        tabBar.isHidden = true

        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = NovaraTheme.elevated
        appearance.shadowColor = NovaraTheme.border

        let itemAppearance = appearance.stackedLayoutAppearance
        itemAppearance.selected.iconColor = NovaraTheme.primary
        itemAppearance.selected.titleTextAttributes = [.foregroundColor: NovaraTheme.primary]
        itemAppearance.normal.iconColor = NovaraTheme.mutedForeground
        itemAppearance.normal.titleTextAttributes = [.foregroundColor: NovaraTheme.mutedForeground]
        appearance.inlineLayoutAppearance = itemAppearance
        appearance.compactInlineLayoutAppearance = itemAppearance

        tabBar.standardAppearance = appearance
        if #available(iOS 15.0, *) {
            tabBar.scrollEdgeAppearance = appearance
        }
        tabBar.tintColor = NovaraTheme.primary
        tabBar.unselectedItemTintColor = NovaraTheme.mutedForeground

        tabBar.items = NovaraSection.allCases.map { section in
            let item = UITabBarItem(title: section.title,
                                    image: UIImage(systemName: section.symbolName),
                                    selectedImage: UIImage(systemName: section.selectedSymbolName))
            item.tag = section.rawValue
            item.accessibilityIdentifier = "native-nav-\(section.title.lowercased())"
            return item
        }

        view.addSubview(tabBar)
    }

    private func configureOverlays() {
        launchStateView.translatesAutoresizingMaskIntoConstraints = false
        launchStateView.onRetry = { [weak self] in self?.retryLoad() }
        view.addSubview(launchStateView)

        connectionBanner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(connectionBanner)
    }

    private func configureConstraints() {
        let webView = webController.view!
        let tabBarBottom = tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        tabBarBottomConstraint = tabBarBottom

        // Pinned to the view, not the safe area, so the web app keeps seeing the
        // real env(safe-area-inset-top) it already lays out against.
        let bottomToTabBar = webView.bottomAnchor.constraint(equalTo: tabBar.topAnchor)
        let bottomToView = webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        webBottomToTabBar = bottomToTabBar
        webBottomToView = bottomToView
        bottomToTabBar.isActive = false
        bottomToView.isActive = true

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBarBottom,

            launchStateView.topAnchor.constraint(equalTo: view.topAnchor),
            launchStateView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            launchStateView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            launchStateView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            connectionBanner.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            connectionBanner.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            connectionBanner.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        ])
    }

    // MARK: - Tab bar visibility

    /// The tab bar exists only on the signed-in screens it belongs to. Sign-in,
    /// sign-up and the public pages get the plain full-height web view.
    private func setShellVisible(_ visible: Bool) {
        guard tabBar.isHidden == visible else { return }
        tabBar.isHidden = !visible
        webBottomToTabBar?.isActive = visible
        webBottomToView?.isActive = !visible
        view.layoutIfNeeded()
    }

    // MARK: - Navigation

    private func select(_ section: NovaraSection, animated: Bool = true) {
        guard let item = tabBar.items?.first(where: { $0.tag == section.rawValue }) else { return }
        if tabBar.selectedItem !== item {
            tabBar.selectedItem = item
        }
        currentSection = section
    }

    /// Opens an in-app path, whatever the source (a tab tap, a notification).
    func open(path: String) {
        webController.navigate(to: path)
    }

    private func retryLoad() {
        launchStateView.apply(.loading)
        didFinishFirstLoad = false
        webController.reloadApp()
        startLaunchWatchdog()
    }

    private func startLaunchWatchdog() {
        launchWatchdog?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.didFinishFirstLoad else { return }
            self.launchStateView.apply(self.isOnline ? .failed : .offline)
        }
        launchWatchdog = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.launchTimeout, execute: work)
    }

    // MARK: - Connectivity

    private func startNetworkMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.applyConnectivity(online: path.status == .satisfied)
            }
        }
        pathMonitor.start(queue: pathMonitorQueue)

        // Re-read the path whenever the app comes back to the front.
        //
        // NWPathMonitor is a stream of updates, not a source of truth we can
        // poll on demand, and it does occasionally stop delivering them — it
        // wedged in the Simulator during testing and left "No connection"
        // showing over a perfectly working app for as long as it was open.
        // Returning to the foreground is the moment the user is most likely to
        // be looking at a stale banner, so that is where we reconcile against
        // currentPath rather than trusting the last update we happened to get.
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.applyConnectivity(online: self.pathMonitor.currentPath.status == .satisfied)
        }
    }

    /// The single place the connectivity UI is decided.
    ///
    /// Coming back online is applied at once; going offline is held for a
    /// moment first. A connection that drops and returns within a second or two
    /// is something the web app rides out on its own, and flashing a black bar
    /// at the user for it reads as a fault in Novara rather than a blip in
    /// their signal.
    private func applyConnectivity(online: Bool) {
        offlineDebounce?.cancel()
        offlineDebounce = nil

        guard online != isOnline else {
            // No change, but the banner may still be wrong — see the wedged
            // monitor above — so make the view match the state regardless.
            if didFinishFirstLoad { connectionBanner.setVisible(!online) }
            return
        }

        if online {
            isOnline = true
            if didFinishFirstLoad {
                connectionBanner.setVisible(false)
            } else {
                retryLoad()
            }
            return
        }

        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            // Confirm against the monitor rather than acting on a stale flag.
            guard self.pathMonitor.currentPath.status != .satisfied else { return }
            self.isOnline = false
            if self.didFinishFirstLoad {
                self.connectionBanner.setVisible(true)
            } else {
                // Nothing has rendered and there is no network: say so now
                // rather than leaving a spinner turning for 15 seconds.
                self.launchStateView.apply(.offline)
            }
        }
        offlineDebounce = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.offlineGracePeriod, execute: work)
    }

    // MARK: - Device features

    private func presentContactPicker(respond: @escaping (Result<Any, Error>) -> Void) {
        let importer = NovaraContactImport()
        contactImport = importer
        importer.present(from: self) { [weak self] result in
            self?.contactImport = nil
            if case .success(let value) = result,
               let dictionary = value as? [String: Any],
               dictionary["cancelled"] == nil {
                self?.notificationFeedback.notificationOccurred(.success)
            }
            respond(result)
        }
    }

    private func presentCardScanner(respond: @escaping (Result<Any, Error>) -> Void) {
        let scanner = NovaraCardScanner()
        cardScanner = scanner
        scanner.present(from: self) { [weak self] result in
            self?.cardScanner = nil
            switch result {
            case .success(let value):
                if let dictionary = value as? [String: Any], dictionary["cancelled"] == nil {
                    self?.notificationFeedback.notificationOccurred(.success)
                }
            case .failure:
                self?.notificationFeedback.notificationOccurred(.warning)
            }
            respond(result)
        }
    }
}

// MARK: - UITabBarDelegate

extension NovaraRootViewController: UITabBarDelegate {
    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard let section = NovaraSection(rawValue: item.tag) else { return }

        selectionFeedback.selectionChanged()

        // Tapping the tab you are already in returns to that section's root,
        // which is what iOS users expect from a tab bar.
        let target = (section == currentSection) ? section.rootPath : (lastPath[section] ?? section.rootPath)
        currentSection = section
        open(path: target)
    }
}

// MARK: - NovaraWebViewControllerDelegate

extension NovaraRootViewController: NovaraWebViewControllerDelegate {

    func webControllerDidBecomeReady(_ controller: NovaraWebViewController) {
        // Nothing to do here yet: the route message that follows is the signal
        // that the app is genuinely up, and it arrives immediately after.
    }

    func webController(_ controller: NovaraWebViewController, didNavigateTo path: String) {
        if !didFinishFirstLoad {
            didFinishFirstLoad = true
            launchWatchdog?.cancel()
            UIView.animate(withDuration: 0.2, animations: { self.launchStateView.alpha = 0 }) { _ in
                self.launchStateView.isHidden = true
            }
            connectionBanner.setVisible(!isOnline)
        }

        switch NovaraRouter.target(forPath: path) {
        case .section(let section):
            lastPath[section] = NovaraRouter.normalise(path: path)
            setShellVisible(true)
            select(section)
        case .outsideShell:
            currentSection = nil
            setShellVisible(false)
        }
    }

    func webController(_ controller: NovaraWebViewController,
                       didRequest method: String,
                       params: [String: Any],
                       respond: @escaping (Result<Any, Error>) -> Void) {
        switch method {
        case "pickContact":
            presentContactPicker(respond: respond)
        case "scanCard":
            presentCardScanner(respond: respond)
        default:
            respond(.failure(NSError(domain: "Novara", code: -1,
                                     userInfo: [NSLocalizedDescriptionKey: "Unsupported native request"])))
        }
    }

    func webController(_ controller: NovaraWebViewController, didRequestHaptic style: String) {
        switch style {
        case "success": notificationFeedback.notificationOccurred(.success)
        case "warning": notificationFeedback.notificationOccurred(.warning)
        case "error": notificationFeedback.notificationOccurred(.error)
        case "light": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        default: selectionFeedback.selectionChanged()
        }
    }

    func webController(_ controller: NovaraWebViewController, didFailToLoadWith error: Error) {
        guard !didFinishFirstLoad else { return }
        launchStateView.apply(isOnline ? .failed : .offline)
    }
}
