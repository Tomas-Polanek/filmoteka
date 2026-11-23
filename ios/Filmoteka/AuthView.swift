import SwiftUI
import Supabase

struct AuthView: View {
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var info: String?

    private var canSubmit: Bool {
        !username.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty && !busy
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
                        .textContentType(.password)
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                if let info {
                    Section { Text(info) }
                }

                Section {
                    Button("Přihlásit") { Task { await submit(signUp: false) } }
                    Button("Registrovat") { Task { await submit(signUp: true) } }
                }
                .disabled(!canSubmit)
            }
            .navigationTitle("Filmoteka")
        }
    }

    private func submit(signUp: Bool) async {
        error = nil
        info = nil
        guard let name = Account.normalize(username) else {
            error = signUp ? Account.usernameHint : "Špatné jméno nebo heslo"
            return
        }
        if signUp && !Account.isValidPassword(password) {
            error = Account.passwordHint
            return
        }
        busy = true
        defer { busy = false }
        do {
            if signUp {
                let response = try await supabase.auth.signUp(
                    email: Account.email(for: name), password: password, data: ["username": .string(name)])
                // .session: signed in, authStateChanges switches the root view. .user: the project requires confirmation.
                if case .user = response { info = "Účet je založený, ale čeká na potvrzení. Požádej správce." }
            } else {
                try await supabase.auth.signIn(email: Account.email(for: name), password: password)
            }
        } catch {
            self.error = Account.message(for: error)
        }
    }
}
