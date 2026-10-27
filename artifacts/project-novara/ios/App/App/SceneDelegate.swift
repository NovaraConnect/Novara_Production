import UIKit
import Capacitor

// iOS 27 requires the UIScene lifecycle: an app that still builds its window in
// application(_:didFinishLaunchingWithOptions:) is killed by UIKit the moment
// its first scene is created. So the window, and the URL / user-activity
// callbacks that UIKit now delivers to the scene instead of the app delegate,
// live here.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // The window is built here rather than from Main.storyboard.
        //
        // Capacitor's template storyboard contained a single scene whose view
        // controller had no view of its own, because CAPBridgeViewController
        // assigns `view = webView` in loadView(). That is fine for the bridge
        // controller itself, but the native shell (NovaraRootViewController) is
        // an ordinary container that needs a real root view, and a storyboard
        // scene with no `<view>` element loads as a blank black screen.
        //
        // Doing it in code also means there is exactly one place that says what
        // the app's root is, instead of a storyboard that has to be kept in
        // sync with a class name.
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = NovaraRootViewController()
        window.backgroundColor = NovaraTheme.background
        window.makeKeyAndVisible()
        self.window = window

        // On a cold launch the URL or Universal Link arrives in the connection
        // options rather than through the callbacks below.
        self.scene(scene, openURLContexts: connectionOptions.urlContexts)
        if let userActivity = connectionOptions.userActivities.first {
            self.scene(scene, continue: userActivity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Keep forwarding to Capacitor so the App API still sees url opens.
        for context in URLContexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
            options[.sourceApplication] = context.options.sourceApplication
            options[.annotation] = context.options.annotation
            options[.openInPlace] = context.options.openInPlace
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        // Universal Links. Keep forwarding to Capacitor so the App API still
        // sees them.
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

}
