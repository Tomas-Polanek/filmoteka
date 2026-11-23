import Foundation
import Supabase

/// Username-based accounts. Supabase Auth needs an address, so each username maps to an internal one
/// that is never shown in the UI. The backend (profiles trigger, `admin` Edge Function) uses the same mapping.
enum Account {
    static let usernamePattern = "^[a-z0-9][a-z0-9._-]{2,31}$"
    static let minPasswordLength = 6
    private static let emailDomain = "users.filmoteka.app"

    static let usernameHint =
        "Jméno má 3–32 znaků: malá písmena bez diakritiky, číslice, tečka, podtržítko nebo pomlčka; začíná písmenem nebo číslicí."
    static let passwordHint = "Heslo musí mít aspoň \(minPasswordLength) znaků."

    /// Trimmed, lowercased username, or nil when it does not match `usernamePattern`.
    static func normalize(_ input: String) -> String? {
        let username = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return username.range(of: usernamePattern, options: .regularExpression) != nil ? username : nil
    }

    static func email(for username: String) -> String { "\(username)@\(emailDomain)" }

    static func isValidPassword(_ password: String) -> Bool { password.count >= minPasswordLength }

    /// Czech text for Supabase Auth errors; never echoes the server message, which talks about addresses.
    static func message(for error: Error) -> String {
        guard let auth = error as? AuthError else { return error.localizedDescription }
        switch auth.errorCode {
        case .invalidCredentials: return "Špatné jméno nebo heslo"
        case .userAlreadyExists, .emailExists: return "Jméno je obsazené"
        case .weakPassword: return "Heslo je příliš slabé"
        case .samePassword: return "Nové heslo je stejné jako současné"
        case .sessionNotFound: return NotSignedIn().errorDescription ?? ""
        default: return "Něco se nepovedlo, zkus to znovu."
        }
    }
}

nonisolated enum Role: String, Codable, Sendable {
    case admin, user

    var label: String { self == .admin ? "Správce" : "Uživatel" }
}

/// The signed-in user's row in public.profiles.
nonisolated struct Profile: Decodable, Sendable {
    let userId: UUID
    let username: String
    let role: Role
    /// nil = the app's default list (`Places.defaults`).
    let places: [String]?

    enum CodingKeys: String, CodingKey {
        case username, role, places
        case userId = "user_id"
    }
}

/// Update payload for the user's own profile; `places` is the only column the client may change.
/// Encodes nil as JSON null (synthesized Encodable would drop the key and the update would change nothing).
nonisolated private struct PlacesUpdate: Encodable, Sendable {
    let places: [String]?

    enum CodingKeys: String, CodingKey { case places }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(places, forKey: .places)
    }
}

enum Places {
    static let defaults = [
        "Jellyfin", "Netflix", "HBO Max", "Disney+", "Prime Video",
        "Apple TV+", "SkyShowtime", "Kino", "TV",
    ]
    /// Free-text option, always offered last when recording a viewing.
    static let other = "Jiné"
}

/// The signed-in user's profile, shared app-wide via `.environment`.
@MainActor @Observable
final class ProfileStore {
    private(set) var profile: Profile?
    private(set) var error: String?

    /// The user's places for pickers: their own list or the default one.
    var places: [String] { profile?.places ?? Places.defaults }

    func load() async {
        do {
            profile = try await supabase.from("profiles")
                .select("user_id, username, role, places")
                .eq("user_id", value: try myUserId())
                .single()
                .execute()
                .value
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }

    func clear() {
        profile = nil
        error = nil
    }

    /// Saves the user's place list; nil restores the default list.
    func savePlaces(_ places: [String]?) async throws {
        let updated: Profile = try await supabase.from("profiles")
            .update(PlacesUpdate(places: places))
            .eq("user_id", value: try myUserId())
            .select("user_id, username, role, places")
            .single()
            .execute()
            .value
        profile = updated
    }
}
