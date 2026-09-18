import UIKit
import WebKit
import Capacitor

/// What the web layer tells the native shell.
protocol NovaraWebViewControllerDelegate: AnyObject {
    /// The injected bridge finished installing on a freshly loaded page.
    func webControllerDidBecomeReady(_ controller: NovaraWebViewController)
    /// The single-page app moved to `path` (already normalised by the router).
    func webController(_ controller: NovaraWebViewController, didNavigateTo path: String)
    /// The web layer asked for something only the device can do.
    func webController(_ controller: NovaraWebViewController,
                       didRequest method: String,
                       params: [String: Any],
                       respond: @escaping (Result<Any, Error>) -> Void)
    /// The web layer asked for haptic feedback tied to a user action.
    func webController(_ controller: NovaraWebViewController, didRequestHaptic style: String)
    /// The page itself failed to load (DNS, offline, server down).
    func webController(_ controller: NovaraWebViewController, didFailToLoadWith error: Error)
}

/// The Capacitor bridge view controller, extended with Novara's native bridge.
///
/// It stays a `CAPBridgeViewController` subclass on purpose: Capacitor keeps
/// owning the web view, the cookie/session handling that keeps Clerk signed in,
/// the push-notification plugin, and the existing rule that sends off-origin
/// links to the system browser. This class only adds a channel on top.
final class NovaraWebViewController: CAPBridgeViewController {

    weak var novaraDelegate: NovaraWebViewControllerDelegate?

    /// Set once the injected script has reported a route, i.e. the web app is
    /// genuinely running rather than merely requested.
    private(set) var hasLoadedApp = false

    private static let messageHandlerName = "novara"
    private var messageProxy: WeakScriptMessageProxy?
    private var loadingObservation: NSKeyValueObservation?

    /// How long after the web view stops loading we still wait for the page to
    /// report itself before calling it a failure.
    ///
    /// Zero would very nearly do: the injected script reports its route at
    /// DOMContentLoaded, which always precedes `load`, so a page that works has
    /// already spoken by the time `isLoading` goes false. The margin is there
    /// for the pathological slow case, not the normal one.
    private static let reportGracePeriod: TimeInterval = 2

    // MARK: - Capacitor hooks

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        guard let controller = webView?.configuration.userContentController else { return }

        // Injected at document start on every load, including the redirects
        // Clerk performs during sign-in.
        controller.addUserScript(
            WKUserScript(source: NovaraBridgeScript.source,
                         injectionTime: .atDocumentStart,
                         forMainFrameOnly: true)
        )

        let proxy = WeakScriptMessageProxy(target: self)
        messageProxy = proxy
        controller.add(proxy, name: Self.messageHandlerName)

        // A native edge-swipe back, which is what an iOS user reaches for.
        // WKWebView's back-forward list includes pushState entries, so this
        // works for the app's client-side routes and not just full page loads.
        webView?.allowsBackForwardNavigationGestures = true

        // Notice a failed load promptly.
        //
        // Capacitor owns the navigation delegate and does not forward
        // didFailProvisionalNavigation, so this watches the web view's own
        // loading flag instead: if it settles and the page never reported
        // itself, the load did not succeed. Without this the only backstop was
        // the shell's timeout, which left a spinner turning for fifteen seconds
        // after an error that was already known in one.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            guard let self, !webView.isLoading, !self.hasLoadedApp else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.reportGracePeriod) { [weak self] in
                guard let self, !self.hasLoadedApp else { return }
                self.novaraDelegate?.webController(
                    self,
                    didFailToLoadWith: NSError(
                        domain: "Novara",
                        code: -1004,
                        userInfo: [NSLocalizedDescriptionKey: "The Novara web app did not load."]
                    )
                )
            }
        }
    }

    deinit {
        webView?.configuration.userContentController
            .removeScriptMessageHandler(forName: Self.messageHandlerName)
        loadingObservation?.invalidate()
    }

    // MARK: - Driving the web app

    /// Navigates the already-loaded single-page app, without reloading it.
    ///
    /// This is the whole reason the tab bar does not cost a page load: the web
    /// view, its JavaScript heap, and above all the Clerk session in it are
    /// never torn down.
    func navigate(to path: String) {
        evaluate("window.NovaraNative && window.NovaraNative.navigate(\(Self.jsString(path)));")
    }

    func reloadApp() {
        guard let url = bridge?.config.serverURL else {
            webView?.reload()
            return
        }
        hasLoadedApp = false
        webView?.load(URLRequest(url: url))
    }

    /// Answers a pending `NovaraNative.pickContact()` / `.scanCard()` promise.
    func settle(requestId: String, result: Result<Any, Error>) {
        switch result {
        case .success(let value):
            let json = Self.jsonString(from: value) ?? "null"
            evaluate("window.NovaraNative && window.NovaraNative._settle(\(Self.jsString(requestId)), true, \(json));")
        case .failure(let error):
            let json = Self.jsonString(from: ["message": error.localizedDescription]) ?? "{}"
            evaluate("window.NovaraNative && window.NovaraNative._settle(\(Self.jsString(requestId)), false, \(json));")
        }
    }

    /// Fires a `novara:<name>` CustomEvent on `window` in the web app.
    func emit(event name: String, detail: Any?) {
        let json = detail.flatMap { Self.jsonString(from: $0) } ?? "null"
        evaluate("window.NovaraNative && window.NovaraNative._emit(\(Self.jsString(name)), \(json));")
    }

    private func evaluate(_ javaScript: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(javaScript, completionHandler: nil)
        }
    }

    // MARK: - JSON helpers

    private static func jsString(_ value: String) -> String {
        jsonString(from: value) ?? "\"\""
    }

    private static func jsonString(from value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject([value]),
              let data = try? JSONSerialization.data(withJSONObject: [value]),
              let wrapped = String(data: data, encoding: .utf8) else { return nil }
        // Unwrap the single-element array we used to make scalars encodable.
        return String(wrapped.dropFirst().dropLast())
    }
}

// MARK: - Messages from the web layer

extension NovaraWebViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageHandlerName,
              let body = message.body as? [String: Any],
              let name = body["name"] as? String else { return }

        switch name {
        case "ready":
            novaraDelegate?.webControllerDidBecomeReady(self)

        case "route":
            guard let path = body["path"] as? String else { return }
            hasLoadedApp = true
            novaraDelegate?.webController(self, didNavigateTo: path)

        case "haptic":
            novaraDelegate?.webController(self, didRequestHaptic: body["style"] as? String ?? "selection")

        case "openAppSettings":
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }

        case "request":
            guard let id = body["id"] as? String, let method = body["method"] as? String else { return }
            let params = body["params"] as? [String: Any] ?? [:]
            novaraDelegate?.webController(self, didRequest: method, params: params) { [weak self] result in
                self?.settle(requestId: id, result: result)
            }

        default:
            break
        }
    }
}

/// Breaks the retain cycle WKUserContentController would otherwise create by
/// holding its message handlers strongly.
private final class WeakScriptMessageProxy: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
