// ============================================================================
// Capacitor configuration for the iOS shell around the production web app.
//
// The web app is the source of truth. This shell exists to put Novara on
// TestFlight and the App Store; it adds no product logic of its own.
//
// This file is read ONLY by the Capacitor CLI, which is run on demand via
// `pnpm dlx @capacitor/cli@7.4.4` (see docs/production/IOS_TESTFLIGHT.md).
// Capacitor is deliberately NOT a repo dependency: novara-prod-web runs
// `pnpm install --frozen-lockfile` on every deploy, and there is no reason for
// the production web build to install packages it never uses. The CLI's own
// `CapacitorConfig` type is therefore not imported — the shape below is what
// the CLI expects, and it validates the file when it loads it.
//
// TWO MODES, switched by NOVARA_IOS_MODE at `cap sync` time:
//
//   remote (default) — the shell loads https://app.novaraconnect.group.
//     Web releases reach the app the moment Render deploys them, with no
//     rebuild or resubmission. The page origin stays app.novaraconnect.group,
//     so Clerk and the API see exactly what they see in a browser today and
//     NO production configuration has to change. This is the fast path to
//     TestFlight. The trade-off is App Review guideline 4.2: a shell that
//     only loads a website can be rejected as "minimum functionality", so
//     treat this as the internal-testing mode.
//
//   bundled — the built assets ship inside the binary and are served from
//     capacitor://localhost. Better review posture and an offline shell, but
//     the page origin changes, which means the Clerk production instance must
//     accept the native origin before sign-in will work. See
//     docs/production/IOS_TESTFLIGHT.md before switching.
//
// Nothing here changes the deployed web app.
// ============================================================================

const mode = process.env["NOVARA_IOS_MODE"] === "bundled" ? "bundled" : "remote";

const PRODUCTION_WEB_URL = "https://app.novaraconnect.group";

// Clerk's Frontend API host. It MUST be allowed to load inside the web view.
//
// Signing in is not a single-origin flow: once Clerk has authenticated, it
// performs a top-level navigation to
//   https://clerk.novaraconnect.group/v1/client/touch?redirect_url=.../dashboard
// which sets the session cookie and redirects straight back to the app.
//
// Capacitor's default navigation policy cancels ANY top-level navigation away
// from server.url and hands it to the system browser. Without this entry the
// shell therefore ejected the Clerk handshake into Safari and left the web view
// frozen on Clerk's spinner — the user was silently signed in, but the app
// never moved off the sign-in screen.
const CLERK_FRONTEND_API_HOST = "clerk.novaraconnect.group";

const config = {
  appId: "group.novaraconnect.app",
  appName: "Novara",
  // Where `cap sync` copies web assets from. Populated by `pnpm run build`.
  // In remote mode iOS still needs this directory to exist, but the shell
  // loads the live site instead of these files.
  webDir: "dist/public",
  ios: {
    // Matches the app's own background so launch doesn't flash a light frame.
    backgroundColor: "#08111F",
    // Let the web app own the safe-area insets, as it already does for PWA.
    contentInset: "never" as const,
    // Marks the shell in the User-Agent so the web app can recognise it even
    // if the Capacitor bridge has not injected window.Capacitor by the time
    // the first render runs. The web app's isNativeShell() checks both.
    appendUserAgent: "NovaraApp",
  },
  plugins: {
    PushNotifications: {
      // Show a banner, badge and sound even when Novara is in the foreground.
      // iOS suppresses foreground notifications by default — and the "Send test
      // notification" button is always tapped with the app open, so without
      // this the very first test looks like a delivery failure when it is not.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ...(mode === "remote"
    ? {
        server: {
          url: PRODUCTION_WEB_URL,
          // No cleartext: production is HTTPS only.
          cleartext: false,
          // Keep the Clerk sign-in handshake inside the app. See above.
          allowNavigation: [CLERK_FRONTEND_API_HOST],
        },
      }
    : {}),
};

export default config;
