import Foundation
import RevenueCat
import UIKit

/// Apple In-App Purchase for Novara Pro, through RevenueCat.
///
/// THE RULE THIS FILE FOLLOWS: it reports what Apple and RevenueCat say about a
/// purchase. It never decides that the user is Pro. The server does that, from
/// verified RevenueCat webhook events (api-server routes/revenuecat.ts), and the
/// web app asks the server before showing anything as active.
///
/// SETUP. The public SDK key is read from Info.plist (`RevenueCatPublicSDKKey`).
/// It is a public, non-secret identifier that starts with "appl_". The shell
/// refuses to configure while the value is a placeholder, so a build without a
/// real key reports purchases as unavailable instead of failing.
enum NovaraPurchases {

    /// Info.plist key holding the RevenueCat public iOS SDK key.
    static let publicKeyInfoKey = "RevenueCatPublicSDKKey"

    /// RevenueCat entitlement identifier for Novara Pro. Must match the
    /// entitlement configured in RevenueCat and the server's NOVARA_PRO_ENTITLEMENT.
    static let proEntitlementId = "novara_pro"

    /// Apple's own subscription management page.
    static let manageSubscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions")!

    private static var configured = false

    /// Configures the SDK once. Returns false when no real key is present.
    @discardableResult
    static func configureIfNeeded() -> Bool {
        if configured { return true }
        guard let key = Bundle.main.object(forInfoDictionaryKey: publicKeyInfoKey) as? String,
              key.hasPrefix("appl_"),
              !key.contains("REPLACE") else {
            return false
        }
        Purchases.logLevel = .error
        // Anonymous until the web app identifies the signed-in Clerk user.
        Purchases.configure(withAPIKey: key)
        configured = true
        return true
    }

    private static func unavailable(_ message: String) -> Error {
        NSError(domain: "Novara.Purchases", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static let notConfigured = "Subscriptions aren't set up in this version of the app."

    /// The Novara Pro plans Apple has resolved for this device.
    static func products(completion: @escaping (Result<Any, Error>) -> Void) {
        guard configureIfNeeded() else {
            completion(.failure(unavailable(notConfigured)))
            return
        }
        Purchases.shared.getOfferings { offerings, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            var products: [[String: Any]] = []
            for package in offerings?.current?.availablePackages ?? [] {
                let period: String
                switch package.packageType {
                case .monthly: period = "monthly"
                case .annual: period = "annual"
                default: continue
                }
                products.append([
                    "productId": package.storeProduct.productIdentifier,
                    "period": period,
                    "priceString": package.storeProduct.localizedPriceString,
                ])
            }
            completion(.success(["products": products]))
        }
    }

    /// Links the RevenueCat identity to the signed-in Clerk user ID.
    static func identify(userId: String, completion: @escaping (Result<Any, Error>) -> Void) {
        guard configureIfNeeded() else {
            completion(.failure(unavailable(notConfigured)))
            return
        }
        // Clerk user IDs only. An anonymous or malformed identity would make the
        // webhook ignore the purchase, so it is refused here instead.
        guard userId.hasPrefix("user_"), userId.count <= 128 else {
            completion(.failure(unavailable("Sign in again to manage your subscription.")))
            return
        }
        Purchases.shared.logIn(userId) { _, _, error in
            if let error = error {
                completion(.failure(error))
            } else {
                completion(.success(["ok": true]))
            }
        }
    }

    /// Starts a purchase of one plan. Reports "purchased", "pending" or "cancelled".
    /// "purchased" means Apple accepted the payment; it does not mean Pro is active.
    static func purchase(productId: String, completion: @escaping (Result<Any, Error>) -> Void) {
        guard configureIfNeeded() else {
            completion(.failure(unavailable(notConfigured)))
            return
        }
        Purchases.shared.getOfferings { offerings, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            guard let package = offerings?.current?.availablePackages.first(where: {
                $0.storeProduct.productIdentifier == productId
            }) else {
                completion(.failure(unavailable("That plan isn't available right now.")))
                return
            }
            Purchases.shared.purchase(package: package) { _, _, error, userCancelled in
                if userCancelled {
                    completion(.success(["outcome": "cancelled"]))
                    return
                }
                if let error = error {
                    // Awaiting approval (for example Ask to Buy) is not a failure.
                    if (error as NSError).code == ErrorCode.paymentPendingError.rawValue {
                        completion(.success(["outcome": "pending"]))
                    } else {
                        completion(.failure(error))
                    }
                    return
                }
                completion(.success(["outcome": "purchased"]))
            }
        }
    }

    /// Restores purchases from the Apple Account. "restored" means Apple reports an
    /// active Novara Pro subscription on this device; the server still confirms it.
    static func restore(completion: @escaping (Result<Any, Error>) -> Void) {
        guard configureIfNeeded() else {
            completion(.failure(unavailable(notConfigured)))
            return
        }
        Purchases.shared.restorePurchases { customerInfo, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            let active = customerInfo?.entitlements[proEntitlementId]?.isActive == true
            completion(.success(["outcome": active ? "restored" : "nothing"]))
        }
    }

    /// Opens Apple's subscription settings. Works even when the SDK is not configured.
    static func openSubscriptionSettings(completion: @escaping (Result<Any, Error>) -> Void) {
        DispatchQueue.main.async {
            UIApplication.shared.open(manageSubscriptionsURL, options: [:]) { opened in
                if opened {
                    completion(.success(["ok": true]))
                } else {
                    completion(.failure(unavailable("Couldn't open subscription settings.")))
                }
            }
        }
    }
}
