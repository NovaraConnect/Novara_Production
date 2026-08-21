const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:3000");

export default {
  expo: {
    name: "Project Novara",
    slug: "novara-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "novara-mobile",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#f7f5f0",
    },
    ios: { supportsTablet: false },
    android: {},
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
    },
  },
};
