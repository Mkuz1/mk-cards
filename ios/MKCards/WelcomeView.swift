import AuthenticationServices
import SwiftUI

/// The first screen for people who are not signed in.
struct WelcomeView: View {
    @EnvironmentObject var model: AppModel
    @State private var sheet: AuthSheet?

    enum AuthSheet: String, Identifiable {
        case login, register
        var id: String { rawValue }
    }

    var body: some View {
        ZStack {
            Theme.night
            VStack(spacing: 0) {
                Spacer(minLength: 40)
                Image("Logo").resizable().scaledToFit().frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .shadow(color: .black.opacity(0.45), radius: 24, y: 12)
                Text("MK Cards")
                    .font(.system(size: 40, weight: .bold, design: .serif))
                    .foregroundStyle(.white)
                    .padding(.top, 22)
                Rectangle().fill(Theme.softGold).frame(width: 46, height: 2).padding(.vertical, 14)
                Text("Your business card, always with you.\nShare it with a QR code, a link, NFC or Apple Wallet.")
                    .font(.system(size: 16))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.8))
                    .padding(.horizontal, 32)
                Spacer(minLength: 32)

                VStack(spacing: 12) {
                    SignInWithAppleButton(.continue, onRequest: model.prepareApple, onCompletion: model.finishApple)
                        .signInWithAppleButtonStyle(.white)
                        .frame(height: 52)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    if model.sso.microsoft == true {
                        Button { model.signIn(with: "microsoft") } label: {
                            HStack(spacing: 10) { MicrosoftMark(); Text("Continue with Microsoft") }
                        }
                        .buttonStyle(PrimaryButtonStyle(light: true))
                    }
                    if model.sso.google == true {
                        Button { model.signIn(with: "google") } label: {
                            HStack(spacing: 10) { Text("G").font(.system(size: 19, weight: .bold)).foregroundStyle(.blue); Text("Continue with Google") }
                        }
                        .buttonStyle(PrimaryButtonStyle(light: true))
                    }
                    Button("Log in with username") { sheet = .login }
                        .buttonStyle(GlassButtonStyle())
                    Button { sheet = .register } label: {
                        Text("New here? ").foregroundColor(.white.opacity(0.7)) + Text("Create an account").foregroundColor(Theme.softGold).bold()
                    }
                    .padding(.top, 6)
                    Link("Privacy", destination: model.url("/privacy"))
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.55))
                        .padding(.top, 4)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .disabled(model.busy)
            }
            .frame(maxWidth: 480)
            if model.busy { ProgressView().tint(.white).scaleEffect(1.3) }
        }
        .sheet(item: $sheet) { which in
            switch which {
            case .login: LoginView()
            case .register: RegisterView()
            }
        }
        .task { await model.refresh() }
    }
}

struct MicrosoftMark: View {
    var body: some View {
        Grid(horizontalSpacing: 1.5, verticalSpacing: 1.5) {
            GridRow { Rectangle().fill(Color(red: 0.95, green: 0.31, blue: 0.13)); Rectangle().fill(Color(red: 0.50, green: 0.73, blue: 0.0)) }
            GridRow { Rectangle().fill(Color(red: 0.0, green: 0.64, blue: 0.94)); Rectangle().fill(Color(red: 1.0, green: 0.73, blue: 0.0)) }
        }
        .frame(width: 18, height: 18)
    }
}

/// Native sign-in with username (or email) and password.
struct LoginView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var login = ""
    @State private var password = ""
    @State private var error: String?
    @State private var working = false
    @FocusState private var focus: Field?
    enum Field { case login, password }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Username or email", text: $login)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .focused($focus, equals: .login)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                } footer: {
                    Text("Forgot your password? Passwords are never reset by email. Ask your company administrator, or sign in with Apple, Microsoft or Google if you connected them.")
                }
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) }
                }
                Section {
                    Button(action: submit) {
                        HStack { Spacer(); if working { ProgressView() } else { Text("Log in").bold() }; Spacer() }
                    }
                    .disabled(login.isEmpty || password.isEmpty || working)
                }
            }
            .navigationTitle("Log in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear { focus = .login }
        }
    }

    private func submit() {
        guard !login.isEmpty, !password.isEmpty else { return }
        working = true
        error = nil
        Task {
            do {
                try await model.logIn(login: login.trimmingCharacters(in: .whitespaces), password: password)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            working = false
        }
    }
}

/// Native account creation.
struct RegisterView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var working = false

    private var host: String { model.site.host ?? "mkcards" }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Username", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: username) { value in username = value.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" } }
                } footer: {
                    Text("Your card will live at \(host)/\(username.isEmpty ? "username" : username)")
                }
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password (at least 8 characters)", text: $password)
                        .textContentType(.newPassword)
                } footer: {
                    Text("Keep your password safe: it cannot be reset by email, only changed from your account.")
                }
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) }
                }
                Section {
                    Button(action: submit) {
                        HStack { Spacer(); if working { ProgressView() } else { Text("Create account").bold() }; Spacer() }
                    }
                    .disabled(username.count < 3 || email.isEmpty || password.count < 8 || working)
                } footer: {
                    Text("By creating an account you agree to the MK Cards privacy policy.")
                }
            }
            .navigationTitle("Create account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func submit() {
        working = true
        error = nil
        Task {
            do {
                try await model.register(username: username, email: email.trimmingCharacters(in: .whitespaces), password: password)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            working = false
        }
    }
}
