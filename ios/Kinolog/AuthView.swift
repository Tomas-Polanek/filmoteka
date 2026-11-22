import SwiftUI
import Supabase

struct AuthView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var info: String?

    private var canSubmit: Bool { !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty && !busy }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("E-mail", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
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
            .navigationTitle("Kinolog")
        }
    }

    private func submit(signUp: Bool) async {
        busy = true
        error = nil
        info = nil
        defer { busy = false }
        let address = email.trimmingCharacters(in: .whitespaces)
        do {
            if signUp {
                let response = try await supabase.auth.signUp(email: address, password: password)
                // .session: signed in, authStateChanges switches the root view. .user: awaiting e-mail confirmation.
                if case .user = response { info = "Zkontroluj e-mail a potvrď registraci" }
            } else {
                try await supabase.auth.signIn(email: address, password: password)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
