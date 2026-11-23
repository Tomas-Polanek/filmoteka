import SwiftUI

/// Admin only: all accounts, managed through the `admin` Edge Function. Diaries stay private to their owners.
struct UsersView: View {
    @Environment(ProfileStore.self) private var profileStore
    @State private var users: [AdminUser] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var creating = false

    private var adminCount: Int { users.filter { $0.role == .admin }.count }

    var body: some View {
        List {
            if let error {
                Text(error).foregroundStyle(.red)
            }
            ForEach(users) { user in
                NavigationLink {
                    UserDetailView(
                        user: user,
                        isSelf: user.userId == profileStore.profile?.userId,
                        isLastAdmin: user.role == .admin && adminCount == 1,
                        onChanged: load)
                } label: {
                    UserRow(user: user)
                }
            }
        }
        .navigationTitle("Uživatelé")
        .overlay {
            if !loaded && error == nil { ProgressView() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { creating = true } label: { Label("Nový uživatel", systemImage: "plus") }
            }
        }
        .refreshable { await load() }
        .sheet(isPresented: $creating) {
            CreateUserView { user in
                users.append(user)
                users.sort { $0.username < $1.username }
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            users = try await AdminAPI.list()
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
        loaded = true
    }
}

private struct UserRow: View {
    let user: AdminUser

    var body: some View {
        HStack {
            Text(user.username)
            Spacer()
            if user.role == .admin {
                Text(user.role.label)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(.tint.opacity(0.15), in: Capsule())
                    .foregroundStyle(.tint)
            }
        }
    }
}

private struct CreateUserView: View {
    let onCreated: (AdminUser) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var password = ""
    @State private var isAdmin = false
    @State private var saving = false
    @State private var error: String?

    private var problem: String? {
        if Account.normalize(username) == nil { return Account.usernameHint }
        if !Account.isValidPassword(password) { return Account.passwordHint }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Uživatelské jméno", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Heslo", text: $password)
                        .textContentType(.newPassword)
                    Toggle("Správce", isOn: $isAdmin)
                } footer: {
                    if !username.isEmpty, !password.isEmpty, let problem { Text(problem) }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Nový uživatel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await save() } }
                        .disabled(problem != nil || saving)
                }
            }
        }
    }

    private func save() async {
        guard !saving, let name = Account.normalize(username), Account.isValidPassword(password) else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let user = try await AdminAPI.create(username: name, password: password, role: isAdmin ? .admin : .user)
            onCreated(user)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct UserDetailView: View {
    let user: AdminUser
    /// The server refuses to delete yourself, so the button is hidden.
    let isSelf: Bool
    /// The server refuses to remove the last admin, so the role toggle is hidden.
    let isLastAdmin: Bool
    let onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(ProfileStore.self) private var profileStore
    @State private var role: Role
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false

    init(user: AdminUser, isSelf: Bool, isLastAdmin: Bool, onChanged: @escaping () async -> Void) {
        self.user = user
        self.isSelf = isSelf
        self.isLastAdmin = isLastAdmin
        self.onChanged = onChanged
        _role = State(initialValue: user.role)
    }

    private var adminBinding: Binding<Bool> {
        Binding(
            get: { role == .admin },
            set: { isAdmin in Task { await setRole(isAdmin ? .admin : .user) } })
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("Uživatelské jméno", value: user.username)
                if isLastAdmin {
                    LabeledContent("Role", value: role.label)
                } else {
                    Toggle("Správce", isOn: adminBinding)
                        .disabled(busy)
                }
            } footer: {
                if isLastAdmin { Text("Poslední správce nemůže o roli přijít.") }
            }

            Section {
                NavigationLink("Nastavit heslo") {
                    NewPasswordView(title: "Nastavit heslo") { password in
                        try await AdminAPI.setPassword(userId: user.userId, password: password)
                    }
                }
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }

            if !isSelf {
                Section {
                    Button("Smazat účet", role: .destructive) { confirmDelete = true }
                        .disabled(busy)
                }
            }
        }
        .navigationTitle(user.username)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Smazat účet \(user.username)?", isPresented: $confirmDelete) {
            Button("Smazat", role: .destructive) { Task { await delete() } }
            Button("Zrušit", role: .cancel) {}
        } message: {
            Text("Smažou se i všechna jeho zhlédnutí a seznam Chci vidět.")
        }
    }

    private func setRole(_ newRole: Role) async {
        guard !busy, newRole != role else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await AdminAPI.setRole(userId: user.userId, role: newRole)
            role = newRole
            await onChanged()
            // demoting yourself hides the admin section
            if isSelf { await profileStore.load() }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await AdminAPI.delete(userId: user.userId)
            await onChanged()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
