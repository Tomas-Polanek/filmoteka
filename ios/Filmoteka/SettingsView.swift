import SwiftUI
import Supabase

struct SettingsView: View {
    @Environment(ProfileStore.self) private var profileStore
    @AppStorage(Theme.storageKey) private var theme = Theme.system
    @AppStorage(Accent.storageKey) private var accent = Accent.blue
    @State private var confirmSignOut = false
    @State private var signOutError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Účet") {
                    if let profile = profileStore.profile {
                        LabeledContent("Uživatelské jméno", value: profile.username)
                        LabeledContent("Role", value: profile.role.label)
                    } else if let error = profileStore.error {
                        Text(error).foregroundStyle(.red)
                        Button("Zkusit znovu") { Task { await profileStore.load() } }
                    } else {
                        ProgressView()
                    }
                    NavigationLink("Změnit heslo") {
                        NewPasswordView(title: "Změnit heslo") { password in
                            _ = try await supabase.auth.update(user: UserAttributes(password: password))
                        }
                    }
                }

                Section("Vzhled") {
                    Picker("Motiv", selection: $theme) {
                        ForEach(Theme.allCases) { Text($0.label).tag($0) }
                    }
                    LabeledContent("Barva") {
                        AccentPicker(selection: $accent)
                    }
                }

                Section("Místa") {
                    NavigationLink("Moje místa") { PlacesView() }
                }

                if profileStore.profile?.role == .admin {
                    Section("Správa uživatelů") {
                        NavigationLink("Uživatelé") { UsersView() }
                    }
                }

                AboutSection()

                Section {
                    Button("Odhlásit", role: .destructive) { confirmSignOut = true }
                } footer: {
                    if let signOutError { Text(signOutError).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Nastavení")
            .alert("Odhlásit se?", isPresented: $confirmSignOut) {
                Button("Odhlásit", role: .destructive) { Task { await signOut() } }
                Button("Zrušit", role: .cancel) {}
            }
        }
    }

    private func signOut() async {
        do {
            try await supabase.auth.signOut(scope: .local)
        } catch {
            signOutError = error.localizedDescription
        }
    }
}

/// A row of color swatches; the selected one has a checkmark.
private struct AccentPicker: View {
    @Binding var selection: Accent

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Accent.allCases) { accent in
                Button { selection = accent } label: {
                    Circle()
                        .fill(accent.color)
                        .frame(width: 24, height: 24)
                        .overlay {
                            if accent == selection {
                                Image(systemName: "checkmark")
                                    .font(.caption.bold())
                                    .foregroundStyle(.white)
                            }
                        }
                }
                // plain: otherwise the whole form row would trigger every swatch at once
                .buttonStyle(.plain)
                .accessibilityLabel(accent.label)
                .accessibilityAddTraits(accent == selection ? .isSelected : [])
            }
        }
    }
}

/// New password + repeat, saved from the navigation bar. Used for the own password and by admins for others.
struct NewPasswordView: View {
    let title: String
    let save: (String) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var repeated = ""
    @State private var saving = false
    @State private var error: String?
    @State private var done = false

    private var problem: String? {
        if !Account.isValidPassword(password) { return Account.passwordHint }
        if password != repeated { return "Hesla se neshodují." }
        return nil
    }

    var body: some View {
        Form {
            Section {
                SecureField("Nové heslo", text: $password)
                    .textContentType(.newPassword)
                SecureField("Nové heslo znovu", text: $repeated)
                    .textContentType(.newPassword)
            } footer: {
                if !password.isEmpty, !repeated.isEmpty, let problem { Text(problem) }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Uložit") { Task { await submit() } }
                    .disabled(problem != nil || saving)
            }
        }
        .alert("Heslo je změněné", isPresented: $done) {
            Button("OK") { dismiss() }
        }
    }

    private func submit() async {
        guard !saving, problem == nil else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await save(password)
            done = true
        } catch {
            self.error = Account.message(for: error)
        }
    }
}

/// The user's own place list for "Kde"; every change is saved right away.
private struct PlacesView: View {
    @Environment(ProfileStore.self) private var profileStore
    @State private var newPlace = ""
    @State private var error: String?
    @State private var confirmReset = false

    private var places: [String] { profileStore.places }

    private var trimmedNew: String { newPlace.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var canAdd: Bool {
        !trimmedNew.isEmpty && !(places + [Places.other]).contains { $0.caseInsensitiveCompare(trimmedNew) == .orderedSame }
    }

    var body: some View {
        List {
            Section {
                HStack {
                    TextField("Nové místo", text: $newPlace)
                        .onSubmit(add)
                        .submitLabel(.done)
                    Button("Přidat", action: add)
                        .disabled(!canAdd)
                }
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }

            Section {
                ForEach(places, id: \.self) { Text($0) }
                    .onDelete { offsets in
                        var updated = places
                        updated.remove(atOffsets: offsets)
                        save(updated)
                    }
                    .onMove { source, destination in
                        var updated = places
                        updated.move(fromOffsets: source, toOffset: destination)
                        save(updated)
                    }
            } footer: {
                Text("„\(Places.other)“ s vlastním textem je při přidávání zhlédnutí k dispozici vždy.")
            }

            Section {
                Button("Obnovit výchozí") { confirmReset = true }
                    .disabled(profileStore.profile?.places == nil)
            }
        }
        .navigationTitle("Moje místa")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .alert("Obnovit výchozí místa?", isPresented: $confirmReset) {
            Button("Obnovit", role: .destructive) { save(nil) }
            Button("Zrušit", role: .cancel) {}
        }
    }

    private func add() {
        guard canAdd else { return }
        save(places + [trimmedNew])
        newPlace = ""
    }

    /// nil restores the default list.
    private func save(_ updated: [String]?) {
        Task {
            do {
                try await profileStore.savePlaces(updated)
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
