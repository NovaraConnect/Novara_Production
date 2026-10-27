import Foundation
import RevenueCat
import StoreKit
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
    ///
    /// `trialDays` is the free trial this Apple Account would get on that plan,
    /// or 0. Apple gives the introductory offer once per subscription group, so
    /// it is checked per account: someone who already had the trial must not be
    /// promised it again. Anything short of a confirmed "eligible" reports 0.
    static func products(completion: @escaping (Result<Any, Error>) -> Void) {
        #if DEBUG
        if isLocalStoreKitTest { NovaraLocalStoreKit.products(completion: completion); return }
        #endif
        guard configureIfNeeded() else {
            completion(.failure(unavailable(notConfigured)))
            return
        }
        Purchases.shared.getOfferings { offerings, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            let packages = (offerings?.current?.availablePackages ?? []).filter {
                $0.packageType == .monthly || $0.packageType == .annual
            }
            let ids = packages.map { $0.storeProduct.productIdentifier }
            Purchases.shared.checkTrialOrIntroDiscountEligibility(productIdentifiers: ids) { eligibility in
                let products: [[String: Any]] = packages.map { package in
                    let product = package.storeProduct
                    return [
                        "productId": product.productIdentifier,
                        "period": package.packageType == .annual ? "annual" : "monthly",
                        "priceString": product.localizedPriceString,
                        "price": NSDecimalNumber(decimal: product.price).doubleValue,
                        "trialDays": freeTrialDays(product, eligibility[product.productIdentifier]),
                    ]
                }
                completion(.success(["products": products]))
            }
        }
    }

    /// Length of the product's free-trial introductory offer in days, or 0 when
    /// it has none or this Apple Account is not (or not known to be) eligible.
    private static func freeTrialDays(_ product: StoreProduct, _ eligibility: IntroEligibility?) -> Int {
        guard eligibility?.status == .eligible,
              let intro = product.introductoryDiscount,
              intro.paymentMode == .freeTrial else { return 0 }
        let unitDays: Int
        switch intro.subscriptionPeriod.unit {
        case .day: unitDays = 1
        case .week: unitDays = 7
        case .month: unitDays = 30
        case .year: unitDays = 365
        @unknown default: return 0
        }
        return intro.subscriptionPeriod.value * unitDays * max(intro.numberOfPeriods, 1)
    }

    /// Links the RevenueCat identity to the signed-in Clerk user ID.
    static func identify(userId: String, completion: @escaping (Result<Any, Error>) -> Void) {
        #if DEBUG
        if isLocalStoreKitTest { completion(.success(["ok": true])); return }
        #endif
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
        #if DEBUG
        if isLocalStoreKitTest { NovaraLocalStoreKit.purchase(productId: productId, completion: completion); return }
        #endif
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
        #if DEBUG
        if isLocalStoreKitTest { NovaraLocalStoreKit.restore(completion: completion); return }
        #endif
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
        #if DEBUG
        if isLocalStoreKitTest { NovaraLocalStoreKit.manage(completion: completion); return }
        #endif
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

// MARK: - Local StoreKit testing (DEBUG builds only)

extension NovaraPurchases {
    /// True only in a DEBUG build launched by the "Novara Connect (StoreKit Test)"
    /// scheme, which sets NOVARA_STOREKIT_TEST=1 and attaches NovaraPro.storekit.
    /// Purchases then go to Xcode's local StoreKit test store instead of
    /// RevenueCat and Apple: no App Store Connect, no RevenueCat, no money.
    /// Always false in Release builds (TestFlight and the App Store).
    static var isLocalStoreKitTest: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.environment["NOVARA_STOREKIT_TEST"] == "1"
        #else
        return false
        #endif
    }
}

#if DEBUG
/// StoreKit 2 directly, for the simulator. Mirrors NovaraPurchases' answers so
/// the web paywall cannot tell the difference, and adds `entitlement`, which
/// the web app reports to a local API in place of the RevenueCat webhook.
enum NovaraLocalStoreKit {

    /// Must match NovaraPro.storekit and the App Store Connect product IDs.
    static let productIds = ["group.novaraconnect.app.pro.monthly", "group.novaraconnect.app.pro.annual"]

    private static var listener: Task<Void, Never>?

    /// Finishes renewals and other transactions StoreKit delivers in the
    /// background, so the test store does not keep redelivering them.
    private static func listenOnce() {
        guard listener == nil else { return }
        listener = Task.detached {
            for await update in StoreKit.Transaction.updates {
                if case .verified(let transaction) = update { await transaction.finish() }
            }
        }
    }

    private static func run(_ completion: @escaping (Result<Any, Error>) -> Void,
                            _ work: @escaping @MainActor () async throws -> Any) {
        listenOnce()
        Task { @MainActor in
            do { completion(.success(try await work())) } catch { completion(.failure(error)) }
        }
    }

    private static func failure(_ message: String) -> Error {
        NSError(domain: "Novara.LocalStoreKit", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    @MainActor private static var activeScene: UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }

    private static func days(_ period: StoreKit.Product.SubscriptionPeriod) -> Int {
        switch period.unit {
        case .day: return period.value
        case .week: return period.value * 7
        case .month: return period.value * 30
        case .year: return period.value * 365
        @unknown default: return 0
        }
    }

    static func products(completion: @escaping (Result<Any, Error>) -> Void) {
        run(completion) {
            var list: [[String: Any]] = []
            for product in try await StoreKit.Product.products(for: productIds) {
                guard let subscription = product.subscription else { continue }
                var trialDays = 0
                if let intro = subscription.introductoryOffer, intro.paymentMode == .freeTrial,
                   await subscription.isEligibleForIntroOffer {
                    trialDays = days(intro.period) * max(intro.periodCount, 1)
                }
                list.append([
                    "productId": product.id,
                    "period": subscription.subscriptionPeriod.unit == .year ? "annual" : "monthly",
                    "priceString": product.displayPrice,
                    "price": NSDecimalNumber(decimal: product.price).doubleValue,
                    "trialDays": trialDays,
                ])
            }
            if list.isEmpty {
                throw failure("No test products. Run the \"Novara Connect (StoreKit Test)\" scheme from Xcode.")
            }
            return ["products": list]
        }
    }

    static func purchase(productId: String, completion: @escaping (Result<Any, Error>) -> Void) {
        run(completion) {
            guard let product = try await StoreKit.Product.products(for: [productId]).first else {
                throw failure("That plan isn't available right now.")
            }
            let result: StoreKit.Product.PurchaseResult
            if #available(iOS 17.0, *), let scene = activeScene {
                result = try await product.purchase(confirmIn: scene)
            } else {
                result = try await product.purchase()
            }
            switch result {
            case .success(let verification):
                if case .verified(let transaction) = verification { await transaction.finish() }
                return ["outcome": "purchased"]
            case .pending:
                return ["outcome": "pending"]
            case .userCancelled:
                return ["outcome": "cancelled"]
            @unknown default:
                return ["outcome": "cancelled"]
            }
        }
    }

    static func restore(completion: @escaping (Result<Any, Error>) -> Void) {
        run(completion) {
            try await StoreKit.AppStore.sync()
            let current = try await currentEntitlement()
            return ["outcome": (current["active"] as? Bool) == true ? "restored" : "nothing"]
        }
    }

    static func manage(completion: @escaping (Result<Any, Error>) -> Void) {
        run(completion) {
            guard let scene = activeScene else { throw failure("Couldn't open subscription settings.") }
            try await StoreKit.AppStore.showManageSubscriptions(in: scene)
            return ["ok": true]
        }
    }

    /// The newest Novara Pro transaction in the test store: active or not, its
    /// product, its expiry, and whether it is the free trial.
    static func entitlement(completion: @escaping (Result<Any, Error>) -> Void) {
        run(completion) { try await currentEntitlement() }
    }

    /// Whether auto-renew is on for this subscription (off once the user
    /// cancels in Xcode's transaction manager), or nil when StoreKit can't say.
    private static func willAutoRenew(_ transaction: StoreKit.Transaction) async -> Bool? {
        guard let product = try? await StoreKit.Product.products(for: [transaction.productID]).first,
              let statuses = try? await product.subscription?.status else { return nil }
        let status = statuses.first { status in
            if case .verified(let t) = status.transaction { return t.originalID == transaction.originalID }
            return false
        } ?? statuses.first
        guard let status, case .verified(let renewal) = status.renewalInfo else { return nil }
        return renewal.willAutoRenew
    }

    private static func currentEntitlement() async throws -> [String: Any] {
        var latest: StoreKit.Transaction?
        for id in productIds {
            if let result = await StoreKit.Transaction.latest(for: id), case .verified(let transaction) = result,
               latest.map({ transaction.purchaseDate > $0.purchaseDate }) ?? true {
                latest = transaction
            }
        }
        guard let transaction = latest else {
            return ["active": false, "productId": NSNull(), "expiresAt": NSNull(), "isTrial": false]
        }
        let expires = transaction.expirationDate
        let isTrial: Bool
        if #available(iOS 17.2, *) {
            isTrial = transaction.offer?.type == .introductory
        } else {
            isTrial = transaction.offerType == .introductory
        }
        return [
            "active": transaction.revocationDate == nil && (expires.map { $0 > Date() } ?? false),
            "productId": transaction.productID,
            "expiresAt": expires.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull(),
            "isTrial": isTrial,
            "willRenew": await willAutoRenew(transaction) ?? NSNull(),
        ]
    }
}
#endif
