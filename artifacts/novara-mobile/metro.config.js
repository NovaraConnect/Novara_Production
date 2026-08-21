const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver = config.resolver || {};

// Tell Metro where to find modules when pnpm's symlink structure confuses it
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
];

// Explicitly map packages that transitive deps can't find through pnpm's .pnpm structure
config.resolver.extraNodeModules = {
  "react-native-reanimated": path.resolve(projectRoot, "node_modules/react-native-reanimated"),
  "react-native-is-edge-to-edge": path.resolve(projectRoot, "node_modules/react-native-is-edge-to-edge"),
  "expo-notifications": path.resolve(projectRoot, "node_modules/expo-notifications"),
  "expo-calendar": path.resolve(projectRoot, "node_modules/expo-calendar"),
};

module.exports = config;
