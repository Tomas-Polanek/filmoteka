import SwiftUI
import Supabase

// Setup: new iOS App "Filmoteka" (iOS 17+), drag this folder in, add SPM package
// https://github.com/supabase/supabase-swift (product "Supabase"), copy Config.swift.example -> Config.swift.
// Builds with either Default Actor Isolation setting (MainActor or nonisolated).
// emitLocalSessionAsInitialSession: show the stored session at launch right away (the SDK refreshes it if
// expired and emits .signedOut if that fails); the legacy default logs a runtime warning on every launch.
let supabase = SupabaseClient(
    supabaseURL: Config.supabaseURL,
    supabaseKey: Config.supabaseKey,
    options: SupabaseClientOptions(auth: .init(emitLocalSessionAsInitialSession: true)))

/// The signed-in user's id. Reads of the user's own data MUST filter by it: RLS also returns family members' rows.
func myUserId() throws -> UUID {
    guard let id = supabase.auth.currentUser?.id else { throw NotSignedIn() }
    return id
}

nonisolated struct NotSignedIn: LocalizedError {
    var errorDescription: String? { "Nejsi přihlášen." }
}

@main
struct FilmotekaApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    /// nil until the first auth event (initial session) arrives.
    @State private var signedIn: Bool?

    var body: some View {
        Group {
            if let signedIn {
                if signedIn { MainTabView() } else { AuthView() }
            } else {
                ProgressView()
            }
        }
        .task {
            for await change in supabase.auth.authStateChanges {
                signedIn = change.session != nil
            }
        }
    }
}

/// Signed-in shell. Each feature adds its own tab here.
struct MainTabView: View {
    var body: some View {
        TabView {
            TitlesView()
                .tabItem { Label("Deník", systemImage: "film.stack") }
            WatchlistView()
                .tabItem { Label("Chci vidět", systemImage: "bookmark") }
            TimelineView()
                .tabItem { Label("Kalendář", systemImage: "calendar") }
            FamilyView()
                .tabItem { Label("Rodina", systemImage: "person.3") }
        }
    }
}
