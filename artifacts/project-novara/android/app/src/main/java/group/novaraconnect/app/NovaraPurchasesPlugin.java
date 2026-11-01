package group.novaraconnect.app;

import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.EntitlementInfo;
import com.revenuecat.purchases.LogLevel;
import com.revenuecat.purchases.Offerings;
import com.revenuecat.purchases.Package;
import com.revenuecat.purchases.PackageType;
import com.revenuecat.purchases.PurchaseParams;
import com.revenuecat.purchases.Purchases;
import com.revenuecat.purchases.PurchasesConfiguration;
import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.PurchasesErrorCode;
import com.revenuecat.purchases.interfaces.LogInCallback;
import com.revenuecat.purchases.interfaces.PurchaseCallback;
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback;
import com.revenuecat.purchases.interfaces.ReceiveOfferingsCallback;
import com.revenuecat.purchases.models.Period;
import com.revenuecat.purchases.models.PricingPhase;
import com.revenuecat.purchases.models.StoreProduct;
import com.revenuecat.purchases.models.StoreTransaction;
import com.revenuecat.purchases.models.SubscriptionOption;
import com.revenuecat.purchases.models.SubscriptionOptions;
import java.util.ArrayList;
import java.util.List;

/**
 * Google Play Billing for Novara Pro, through RevenueCat. The Android twin of
 * ios/App/App/Native/NovaraPurchases.swift, with the same answers, so the web
 * paywall cannot tell the two apart.
 *
 * THE RULE THIS FILE FOLLOWS: it reports what Google and RevenueCat say about a
 * purchase. It never decides that the user is Pro. The server does that, from
 * verified RevenueCat webhook events (api-server routes/revenuecat.ts).
 *
 * SETUP. The public SDK key is the string resource revenuecat_public_sdk_key.
 * It is a public, non-secret identifier that starts with "goog_". While it is a
 * placeholder the plugin refuses to configure, so the paywall reports
 * subscriptions as unavailable instead of failing.
 */
@CapacitorPlugin(name = "NovaraPurchases")
public class NovaraPurchasesPlugin extends Plugin {

    /** RevenueCat entitlement identifier. Must match the server's NOVARA_PRO_ENTITLEMENT. */
    static final String PRO_ENTITLEMENT_ID = "novara_pro";

    private static final String NOT_CONFIGURED = "Subscriptions aren't set up in this version of the app.";

    private boolean configured = false;

    /** Configures the SDK once. Returns false when no real key is present. */
    private boolean configureIfNeeded() {
        if (configured) return true;
        String key = getContext().getString(R.string.revenuecat_public_sdk_key);
        if (!key.startsWith("goog_") || key.contains("REPLACE")) return false;
        Purchases.setLogLevel(LogLevel.ERROR);
        // Anonymous until the web app identifies the signed-in Clerk user.
        Purchases.configure(new PurchasesConfiguration.Builder(getContext(), key).build());
        configured = true;
        return true;
    }

    /** The Novara Pro plans Google has resolved for this device. */
    @PluginMethod
    public void getProducts(PluginCall call) {
        if (!configureIfNeeded()) {
            call.reject(NOT_CONFIGURED);
            return;
        }
        Purchases.getSharedInstance().getOfferings(new ReceiveOfferingsCallback() {
            @Override
            public void onReceived(@NonNull Offerings offerings) {
                JSArray products = new JSArray();
                for (Package pkg : currentPackages(offerings)) {
                    StoreProduct product = pkg.getProduct();
                    JSObject item = new JSObject();
                    item.put("productId", product.getId());
                    item.put("period", pkg.getPackageType() == PackageType.ANNUAL ? "annual" : "monthly");
                    item.put("priceString", product.getPrice().getFormatted());
                    item.put("price", product.getPrice().getAmountMicros() / 1_000_000.0);
                    item.put("trialDays", freeTrialDays(product));
                    products.put(item);
                }
                JSObject result = new JSObject();
                result.put("products", products);
                call.resolve(result);
            }

            @Override
            public void onError(@NonNull PurchasesError error) {
                call.reject(error.getMessage());
            }
        });
    }

    /** The current offering's monthly and annual packages. */
    private static List<Package> currentPackages(@Nullable Offerings offerings) {
        List<Package> packages = new ArrayList<>();
        if (offerings == null || offerings.getCurrent() == null) return packages;
        for (Package pkg : offerings.getCurrent().getAvailablePackages()) {
            if (pkg.getPackageType() == PackageType.MONTHLY || pkg.getPackageType() == PackageType.ANNUAL) {
                packages.add(pkg);
            }
        }
        return packages;
    }

    /**
     * Length of the product's free trial in days, or 0. Google only offers a
     * free-trial offer to accounts that are eligible for it, so an account that
     * already had the trial sees none here and is not promised it again.
     */
    private static int freeTrialDays(StoreProduct product) {
        SubscriptionOptions options = product.getSubscriptionOptions();
        if (options == null) return 0;
        SubscriptionOption trial = options.getFreeTrial();
        if (trial == null) return 0;
        PricingPhase phase = trial.getFreePhase();
        if (phase == null) return 0;
        Period period = phase.getBillingPeriod();
        int unitDays;
        switch (period.getUnit()) {
            case DAY: unitDays = 1; break;
            case WEEK: unitDays = 7; break;
            case MONTH: unitDays = 30; break;
            case YEAR: unitDays = 365; break;
            default: return 0;
        }
        Integer cycles = phase.getBillingCycleCount();
        return period.getValue() * unitDays * Math.max(cycles == null ? 1 : cycles, 1);
    }

    /** Links the RevenueCat identity to the signed-in Clerk user ID. */
    @PluginMethod
    public void identify(PluginCall call) {
        if (!configureIfNeeded()) {
            call.reject(NOT_CONFIGURED);
            return;
        }
        String userId = call.getString("userId", "");
        // Clerk user IDs only. An anonymous or malformed identity would make the
        // webhook ignore the purchase, so it is refused here instead.
        if (userId == null || !userId.startsWith("user_") || userId.length() > 128) {
            call.reject("Sign in again to manage your subscription.");
            return;
        }
        Purchases.getSharedInstance().logIn(userId, new LogInCallback() {
            @Override
            public void onReceived(@NonNull CustomerInfo customerInfo, boolean created) {
                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            }

            @Override
            public void onError(@NonNull PurchasesError error) {
                call.reject(error.getMessage());
            }
        });
    }

    /** Starts a purchase of one plan. Reports "purchased", "pending" or "cancelled".
     *  "purchased" means Google accepted the payment; it does not mean Pro is active. */
    @PluginMethod
    public void purchase(PluginCall call) {
        if (!configureIfNeeded()) {
            call.reject(NOT_CONFIGURED);
            return;
        }
        String productId = call.getString("productId", "");
        Purchases.getSharedInstance().getOfferings(new ReceiveOfferingsCallback() {
            @Override
            public void onReceived(@NonNull Offerings offerings) {
                Package chosen = null;
                for (Package pkg : currentPackages(offerings)) {
                    if (pkg.getProduct().getId().equals(productId)) chosen = pkg;
                }
                if (chosen == null || getActivity() == null) {
                    call.reject("That plan isn't available right now.");
                    return;
                }
                PurchaseParams params = new PurchaseParams.Builder(getActivity(), chosen).build();
                Purchases.getSharedInstance().purchase(params, new PurchaseCallback() {
                    @Override
                    public void onCompleted(@NonNull StoreTransaction transaction, @NonNull CustomerInfo customerInfo) {
                        resolveOutcome(call, "purchased");
                    }

                    @Override
                    public void onError(@NonNull PurchasesError error, boolean userCancelled) {
                        if (userCancelled) {
                            resolveOutcome(call, "cancelled");
                        } else if (error.getCode() == PurchasesErrorCode.PaymentPendingError) {
                            // A slow payment method or a parent's approval is not a failure.
                            resolveOutcome(call, "pending");
                        } else {
                            call.reject(error.getMessage());
                        }
                    }
                });
            }

            @Override
            public void onError(@NonNull PurchasesError error) {
                call.reject(error.getMessage());
            }
        });
    }

    private static void resolveOutcome(PluginCall call, String outcome) {
        JSObject result = new JSObject();
        result.put("outcome", outcome);
        call.resolve(result);
    }

    /** Restores purchases from the Google account. "restored" means Google reports an
     *  active Novara Pro subscription on this device; the server still confirms it. */
    @PluginMethod
    public void restorePurchases(PluginCall call) {
        if (!configureIfNeeded()) {
            call.reject(NOT_CONFIGURED);
            return;
        }
        Purchases.getSharedInstance().restorePurchases(new ReceiveCustomerInfoCallback() {
            @Override
            public void onReceived(@NonNull CustomerInfo customerInfo) {
                EntitlementInfo pro = customerInfo.getEntitlements().get(PRO_ENTITLEMENT_ID);
                resolveOutcome(call, pro != null && pro.isActive() ? "restored" : "nothing");
            }

            @Override
            public void onError(@NonNull PurchasesError error) {
                call.reject(error.getMessage());
            }
        });
    }

    /** Opens Google Play's subscription settings for Novara. Works without the SDK. */
    @PluginMethod
    public void manageSubscriptions(PluginCall call) {
        Uri page = Uri.parse("https://play.google.com/store/account/subscriptions?package=" + getContext().getPackageName());
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, page));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open subscription settings.");
        }
    }
}
