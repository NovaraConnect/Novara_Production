import UIKit

/// Novara's colours, taken from the web app's CSS custom properties in
/// `src/index.css` so the native chrome is the same product, not a lookalike.
///
/// The web app is the source of truth for the visual identity. If a token here
/// ever disagrees with `:root` in index.css, index.css wins.
enum NovaraTheme {
    /// --background: #08111F — deep navy, deliberately never pure black.
    static let background = UIColor(red: 0.031, green: 0.067, blue: 0.122, alpha: 1)
    /// --card: #101C2C
    static let surface = UIColor(red: 0.063, green: 0.110, blue: 0.173, alpha: 1)
    /// --elevated: #152235 — the tab bar sits on this so it reads as raised.
    static let elevated = UIColor(red: 0.082, green: 0.133, blue: 0.208, alpha: 1)
    /// --primary: #6F8CFF — Novara periwinkle.
    static let primary = UIColor(red: 0.435, green: 0.549, blue: 1.0, alpha: 1)
    /// --muted-foreground: #7F8DA3
    static let mutedForeground = UIColor(red: 0.498, green: 0.553, blue: 0.639, alpha: 1)
    /// --foreground: #F4F7FB
    static let foreground = UIColor(red: 0.957, green: 0.969, blue: 0.984, alpha: 1)
    /// --border, composited: rgba(148,163,184,.16) over the card surface.
    static let border = UIColor(red: 0.145, green: 0.192, blue: 0.259, alpha: 1)
}
