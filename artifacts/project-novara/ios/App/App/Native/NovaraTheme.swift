import UIKit

/// Novara's colours, taken from the web app's CSS custom properties in
/// `src/index.css` so the native chrome is the same product, not a lookalike.
///
/// The web app is the source of truth for the visual identity. If a token here
/// ever disagrees with index.css, index.css wins.
///
/// EVERY TOKEN IS DYNAMIC. The app used to be dark-only — pinned by
/// `UIUserInterfaceStyle` in Info.plist — so these were flat navy constants.
/// Now the web app offers Light / Dark / System, tells the shell which one it
/// is showing, and the shell sets `overrideUserInterfaceStyle` to match. Making
/// the colours dynamic means the tab bar, the offline banner and the status bar
/// all follow that switch on their own, with no repainting code.
enum NovaraTheme {

    /// Builds a colour that resolves per interface style.
    /// Values are 0–1 sRGB components, to match how they were written before.
    private static func dynamic(
        dark: (CGFloat, CGFloat, CGFloat),
        light: (CGFloat, CGFloat, CGFloat)
    ) -> UIColor {
        UIColor { traits in
            let c = traits.userInterfaceStyle == .light ? light : dark
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        }
    }

    /// --background: #08111F dark / #FAF8F5 light.
    /// Deep navy, deliberately never pure black; warm paper in light.
    static let background = dynamic(
        dark: (0.031, 0.067, 0.122),
        light: (0.980, 0.973, 0.961)
    )

    /// --card: #101C2C dark / #FFFFFF light.
    static let surface = dynamic(
        dark: (0.063, 0.110, 0.173),
        light: (1.000, 1.000, 1.000)
    )

    /// --elevated: #152235 dark / #F6F7F9 light.
    /// The tab bar sits on this so it reads as raised.
    static let elevated = dynamic(
        dark: (0.082, 0.133, 0.208),
        light: (0.965, 0.969, 0.976)
    )

    /// --primary: #6F8CFF dark / #2941A3 light — Novara periwinkle, dropped to
    /// a lightness that carries white text on the light theme.
    static let primary = dynamic(
        dark: (0.435, 0.549, 1.000),
        light: (0.161, 0.255, 0.639)
    )

    /// --muted-foreground: #7F8DA3 dark / #636A79 light.
    static let mutedForeground = dynamic(
        dark: (0.498, 0.553, 0.639),
        light: (0.388, 0.416, 0.475)
    )

    /// --foreground: #F4F7FB dark / #171C26 light.
    static let foreground = dynamic(
        dark: (0.957, 0.969, 0.984),
        light: (0.090, 0.110, 0.149)
    )

    /// --border: rgba(148,163,184,.16) composited over the card surface in
    /// dark; #DCDFE5 in light.
    static let border = dynamic(
        dark: (0.145, 0.192, 0.259),
        light: (0.863, 0.875, 0.898)
    )
}
