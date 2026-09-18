import Foundation

/// The top-level sections of Novara, as a native tab bar exposes them.
///
/// These are NOT new sections. They mirror, one for one, the four destinations
/// the web app already ships in `src/components/BottomNav.tsx` — Dashboard,
/// Contacts, Add and Settings — so the native shell presents the information
/// architecture the product already has rather than inventing one.
///
/// Everything else the web app can show (a contact's detail page, the
/// notification settings, the feedback form) is a *screen inside* one of these
/// sections, which is what `section(forPath:)` below encodes.
enum NovaraSection: Int, CaseIterable {
    case dashboard
    case contacts
    case add
    case settings

    /// The in-app path this tab navigates to. Matches BottomNav's `href`s.
    var rootPath: String {
        switch self {
        case .dashboard: return "/dashboard"
        case .contacts: return "/contacts"
        case .add: return "/add"
        case .settings: return "/settings"
        }
    }

    /// Matches BottomNav's `label`, so the two navigations never disagree.
    var title: String {
        switch self {
        case .dashboard: return "Dashboard"
        case .contacts: return "Contacts"
        case .add: return "Add"
        case .settings: return "Settings"
        }
    }

    /// SF Symbols chosen to read as the closest native equivalent of the
    /// lucide icons the web nav uses (LayoutDashboard, Users, PlusCircle,
    /// Settings), so the switch to a native bar is not a visual redesign.
    var symbolName: String {
        switch self {
        case .dashboard: return "square.grid.2x2"
        case .contacts: return "person.2"
        case .add: return "plus.circle"
        case .settings: return "gearshape"
        }
    }

    var selectedSymbolName: String {
        switch self {
        case .dashboard: return "square.grid.2x2.fill"
        case .contacts: return "person.2.fill"
        case .add: return "plus.circle.fill"
        case .settings: return "gearshape.fill"
        }
    }
}

/// How a given in-app path maps onto the native shell.
enum NovaraRouteTarget: Equatable {
    /// A path that belongs inside one of the four sections: show the tab bar
    /// with that tab selected.
    case section(NovaraSection)
    /// A path that is outside the signed-in shell entirely — sign-in, sign-up,
    /// the install landing page, the public demo. The tab bar must be hidden:
    /// a tab bar floating under a sign-in form is the single clearest way to
    /// make a native shell look wrong.
    case outsideShell
}

enum NovaraRouter {
    /// Strips query and hash, and normalises a trailing slash, so that
    /// "/contacts/123?from=push#top" and "/contacts/123/" both resolve.
    static func normalise(path: String) -> String {
        var value = path
        if let index = value.firstIndex(where: { $0 == "?" || $0 == "#" }) {
            value = String(value[value.startIndex..<index])
        }
        while value.count > 1 && value.hasSuffix("/") {
            value.removeLast()
        }
        return value.isEmpty ? "/" : value
    }

    /// Where a path lives in the native shell.
    ///
    /// Deliberately explicit rather than "anything unknown is the Dashboard":
    /// an unrecognised path is far more likely to be a public/auth page we
    /// should not decorate with a tab bar than a signed-in screen.
    static func target(forPath path: String) -> NovaraRouteTarget {
        let value = normalise(path: path)

        if value == "/dashboard" { return .section(.dashboard) }
        if value == "/contacts" || value.hasPrefix("/contacts/") { return .section(.contacts) }
        if value == "/add" { return .section(.add) }
        if value == "/settings" { return .section(.settings) }
        // Reached from Settings, and returns there with the web app's own back
        // button, so they belong to the Settings tab.
        if value == "/notifications" || value == "/feedback" { return .section(.settings) }

        // "/", "/sign-in…", "/sign-up…", "/install", "/try…", "/demo",
        // "/pitch", "/ux" and anything unknown.
        return .outsideShell
    }
}
