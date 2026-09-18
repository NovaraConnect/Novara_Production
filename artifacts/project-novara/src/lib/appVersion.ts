/**
 * The single source of truth for the version string shown to users.
 *
 * It was previously hard-coded in two places — Settings' footer and the
 * appVersion field attached to bug reports — and both still said "2.0.0"
 * while the app shipping to TestFlight was 1.0.0. A bug report carrying the
 * wrong version is worse than one carrying none, so there is now one constant.
 *
 * Keep this in step with MARKETING_VERSION in
 * ios/App/App.xcodeproj/project.pbxproj when the public version changes.
 */
export const APP_VERSION = "1.0.0";
