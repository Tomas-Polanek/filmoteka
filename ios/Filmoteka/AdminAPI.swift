import Foundation
import Supabase

/// A user account as listed by the `admin` Edge Function.
nonisolated struct AdminUser: Decodable, Identifiable, Hashable, Sendable {
    let userId: UUID
    let username: String
    let role: Role
    let createdAt: String?

    var id: UUID { userId }

    enum CodingKeys: String, CodingKey {
        case username, role
        case userId = "user_id"
        case createdAt = "created_at"
    }
}

/// Error body `{"error": "..."}` of the `admin` Edge Function; the message is Czech and meant for the UI.
nonisolated struct AdminError: LocalizedError, Decodable, Sendable {
    let error: String
    var errorDescription: String? { error }
}

/// Account management through the `admin` Edge Function; the server allows it only for admins.
enum AdminAPI {
    nonisolated private struct UsersResponse: Decodable, Sendable { let users: [AdminUser] }
    nonisolated private struct UserResponse: Decodable, Sendable { let user: AdminUser }
    nonisolated private struct Empty: Decodable, Sendable {}

    static func list() async throws -> [AdminUser] {
        let response: UsersResponse = try await post(["action": "list"])
        return response.users
    }

    static func create(username: String, password: String, role: Role) async throws -> AdminUser {
        let response: UserResponse = try await post([
            "action": "create", "username": username, "password": password, "role": role.rawValue,
        ])
        return response.user
    }

    static func setPassword(userId: UUID, password: String) async throws {
        let _: Empty = try await post(["action": "set_password", "user_id": userId.uuidString, "password": password])
    }

    static func setRole(userId: UUID, role: Role) async throws {
        let _: Empty = try await post(["action": "set_role", "user_id": userId.uuidString, "role": role.rawValue])
    }

    static func delete(userId: UUID) async throws {
        let _: Empty = try await post(["action": "delete", "user_id": userId.uuidString])
    }

    /// The single transport: POST JSON to the function with the user's session.
    private static func post<T: Decodable>(_ body: [String: String]) async throws -> T {
        // `session` refreshes an expired access token before returning it.
        let session = try await supabase.auth.session
        var request = URLRequest(url: Config.supabaseURL.appending(path: "functions/v1/admin"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(Config.supabaseKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            if let error = try? JSONDecoder().decode(AdminError.self, from: data) { throw error }
            throw AdminError(error: "Chyba serveru (\(http.statusCode))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
