import UIKit
import Capacitor

// Scene lifecycle entry point. The iOS 27 SDK refuses to launch apps that do
// not adopt UIScene, so the window is created here, per connected scene.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = NovaraRootViewController()
        window.backgroundColor = NovaraTheme.background
        window.makeKeyAndVisible()
        self.window = window
    }

    // Forward links to the app delegate proxy, so Capacitor plugins and
    // universal links (sign-in handoff) keep working under scenes.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
