// ============================================================================
// Capacitor configuration for the iOS shell around the production web app.
//
// The web app is the source of truth. This shell exists to put Novara on
// TestFlight and the App Store; it adds no product logic of its own.
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
// Nothing here changes the deployed web app; this file is only read by the
// Capacitor CLI on a Mac with Xcode.
// ============================================================================
import type { CapacitorConfig } from "@capacitor/cli";

const mode = process.env["NOVARA_IOS_MODE"] === "bundled" ? "bundled" : "remote";

const PRODUCTION_WEB_URL = "https://app.novaraconnect.group";

const config: CapacitorConfig = {
  appId: "group.novaraconnect.app",
  appName: "Novara",
  // Where `cap sync` copies web assets from. Populated by `pnpm run build`.
  // In remote mode iOS still needs this directory to exist, but the shell
  // loads the live site instead of these files.
  webDir: "dist/public",
  ios: {
    // Matches the app's own background so launch doesn't flash white.
    backgroundColor: "#f9f9f7",
    // Let the web app own the safe-area insets, as it already does for PWA.
    contentInset: "never",
  },
  server:
    mode === "remote"
      ? {
          url: PRODUCTION_WEB_URL,
          // No cleartext: production is HTTPS only.
          cleartext: false,
        }
      : undefined,
};

export default config;
