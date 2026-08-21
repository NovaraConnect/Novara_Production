// Novara — Expo app configuration (production / App Store target).
//
// The API base URL is provided at build time via EXPO_PUBLIC_API_BASE_URL,
// set per build profile in eas.json. The Replit/localhost fallbacks below are
// for local dev only and are not used by EAS production builds.
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:3000");

export default {
  expo: {
    name: "Novara",
    slug: "novara",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "novara",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#f7f5f0",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.novaraconnect.novara",
      buildNumber: "1",
      infoPlist: {
        // Permission usage strings — required by App Review for each capability
        // the app links against (expo-image-picker, expo-calendar, expo-location).
        // Missing/insincere strings are a common rejection reason.
        NSCameraUsageDescription:
          "Novara uses the camera so you can add a photo when creating or editing a contact.",
        NSPhotoLibraryUsageDescription:
          "Novara accesses your photo library so you can attach a photo to a contact.",
        NSCalendarsUsageDescription:
          "Novara adds follow-up reminders to your calendar so you don't miss reaching out.",
        NSCalendarsFullAccessUsageDescription:
          "Novara adds follow-up reminders to your calendar so you don't miss reaching out.",
        NSLocationWhenInUseUsageDescription:
          "Novara uses your location to note where you met a contact.",
        // Standard HTTPS only -> answers App Store Connect export-compliance automatically.
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.novaraconnect.novara",
    },
    web: { favicon: "./assets/images/icon.png" },
    plugins: [
      ["expo-router", { origin: apiBaseUrl || "http://localhost:8081" }],
      "expo-font",
      "expo-web-browser",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      apiBaseUrl,
      // eas.projectId is written here automatically by `eas init`. Do not hand-edit.
      // eas: { projectId: "<uuid-from-eas-init>" },
    },
    // owner: "<your Expo account or org slug>",  // set by `eas init` if using an org
  },
};
