import SwiftUI

/// Color scheme choice. Raw values are persisted via @AppStorage, so keep them stable.
enum Theme: String, CaseIterable, Identifiable {
    case system, light, dark

    static let storageKey = "theme"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "Podle systému"
        case .light: "Světlý"
        case .dark: "Tmavý"
        }
    }

    /// nil follows the system setting.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

/// App accent color. Raw values are persisted via @AppStorage, so keep them stable.
enum Accent: String, CaseIterable, Identifiable {
    case blue, purple, pink, red, orange, yellow, green, teal

    static let storageKey = "accent"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .blue: "Modrá"
        case .purple: "Fialová"
        case .pink: "Růžová"
        case .red: "Červená"
        case .orange: "Oranžová"
        case .yellow: "Žlutá"
        case .green: "Zelená"
        case .teal: "Tyrkysová"
        }
    }

    var color: Color {
        switch self {
        case .blue: .blue
        case .purple: .purple
        case .pink: .pink
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .teal: .teal
        }
    }
}
