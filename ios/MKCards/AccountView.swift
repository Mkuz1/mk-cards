import SwiftUI

/// Native account settings: profile, company, sign-in methods, password, tools, support and account deletion.
struct AccountView: View {
    @EnvironmentObject var model: AppModel
    @State private var page: WebPage?
    @State private var passwordSheet = false
    @State private var deleteSheet = false
    @State private var confirmLogout = false

    private var user: Me.User? { model.me?.user }
    private var mainCard: Me.Entry? { model.me?.cards.first { $0.slug.isEmpty } ?? model.me?.cards.first }

    var body: some View {
        NavigationStack {
            Form {
                if let user {
                    Section {
                        HStack(spacing: 14) {
                            Text(initials(mainCard?.card.name ?? user.username))
                                .font(.system(size: 22, weight: .bold, design: .serif)).foregroundStyle(.white)
                                .frame(width: 60, height: 60)
                                .background(Circle().fill(LinearGradient(colors: [Color(red: 0.114, green: 0.239, blue: 0.439), Theme.navy], startPoint: .top, endPoint: .bottom)))
                                .overlay(Circle().stroke(Theme.softGold, lineWidth: 1.5))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(mainCard?.card.name ?? user.username).font(.title3.bold())
                                Text("@\(user.username)").foregroundStyle(.secondary)
                                Text(user.email).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    Section("Company") {
                        if let org = user.org {
                            LabeledContent(org.name, value: org.isAdmin ? (org.role == "owner" ? "Owner" : "Administrator") : "Member")
                            if org.isAdmin {
                                Button { page = WebPage(title: "Company admin", path: "/admin") } label: { Label("Manage people, sign-in and Salesforce", systemImage: "building.2") }
                            }
                        } else {
                            Button { page = WebPage(title: "Company workspace", path: "/admin") } label: { Label("Set up a company workspace", systemImage: "building.2") }
                        }
                    }

                    Section {
                        LabeledContent("Password", value: user.hasPassword == false ? "Not set" : "Set")
                        Button(user.hasPassword == false ? "Add a password" : "Change password") { passwordSheet = true }
                        ForEach(signInProviders, id: \.self) { provider in
                            let linked = user.identities?.first { $0.provider == provider }
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(providerName(provider))
                                    Text(linked.map { $0.email ?? "Connected" } ?? "Not connected").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if linked != nil {
                                    Button("Disconnect") { Task { await disconnect(provider) } }.foregroundStyle(.red)
                                } else if provider != "apple" {
                                    Button("Connect") { Task { await model.connectIdentity(provider) } }
                                }
                            }
                        }
                    } header: {
                        Text("Sign-in")
                    } footer: {
                        Text("Passwords are never reset by email. Connect Apple, Microsoft or Google to always have another way in.")
                    }

                    if let card = mainCard {
                        Section("Tools") {
                            Button { page = WebPage(title: "Email signature", path: "/signature/\(card.id)") } label: { Label("Email signature", systemImage: "signature") }
                            Button { page = WebPage(title: "Call background", path: "/background/\(card.id)") } label: { Label("Video-call background", systemImage: "video") }
                        }
                    }

                    Section("Support") {
                        Link(destination: model.url("/support")) { Label("Help and support", systemImage: "questionmark.circle") }
                        Link(destination: model.url("/privacy")) { Label("Privacy policy", systemImage: "hand.raised") }
                        LabeledContent("Version", value: AppModel.appVersion)
                    }

                    Section {
                        Button("Log out") { confirmLogout = true }
                        Button("Delete account", role: .destructive) { deleteSheet = true }
                    }
                }
            }
            .navigationTitle("Account")
            .refreshable { await model.refresh() }
            .sheet(item: $page) { WebSheet(page: $0) }
            .sheet(isPresented: $passwordSheet) { PasswordSheet(hasPassword: user?.hasPassword != false) }
            .sheet(isPresented: $deleteSheet) { DeleteAccountSheet(hasPassword: user?.hasPassword != false, username: user?.username ?? "") }
            .confirmationDialog("Log out of MK Cards?", isPresented: $confirmLogout, titleVisibility: .visible) {
                Button("Log out", role: .destructive) { Task { await model.signOut() } }
            }
        }
    }

    private var signInProviders: [String] {
        let linked = Set(user?.identities?.map(\.provider) ?? [])
        return ["apple", "microsoft", "google"].filter { p in
            linked.contains(p) || (p == "microsoft" && model.sso.microsoft == true) || (p == "google" && model.sso.google == true)
        }
    }

    private func providerName(_ p: String) -> String { ["apple": "Apple", "microsoft": "Microsoft", "google": "Google"][p] ?? p }

    private func disconnect(_ provider: String) async {
        do {
            try await model.change("/api/me/identities/\(provider)", method: "DELETE")
            await model.refresh()
        } catch {
            model.alert = error.localizedDescription
        }
    }
}

struct PasswordSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let hasPassword: Bool
    @State private var current = ""
    @State private var next = ""
    @State private var again = ""
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                if hasPassword { SecureField("Current password", text: $current).textContentType(.password) }
                Section {
                    SecureField("New password", text: $next).textContentType(.newPassword)
                    SecureField("New password again", text: $again).textContentType(.newPassword)
                } footer: {
                    Text(hasPassword ? "At least 8 characters. Your other devices will be signed out." : "At least 8 characters. You can then also sign in with your username.")
                }
                if let error { Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) } }
            }
            .navigationTitle(hasPassword ? "Change password" : "Add a password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: { if working { ProgressView() } else { Text("Save").bold() } }
                        .disabled(next.count < 8 || working)
                }
            }
        }
    }

    private func save() async {
        guard next == again else { error = "The two new passwords do not match."; return }
        working = true
        do {
            try await model.change("/api/me/password", json: ["current": current, "next": next])
            await model.refresh()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        working = false
    }
}

struct DeleteAccountSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let hasPassword: Bool
    let username: String
    @State private var value = ""
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Your account, all your cards, your links and QR codes, your contacts and statistics are removed for good. This cannot be undone.")
                }
                Section {
                    if hasPassword {
                        SecureField("Password", text: $value).textContentType(.password)
                    } else {
                        TextField("Type your username (\(username))", text: $value).textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                } footer: {
                    Text(hasPassword ? "Enter your password to confirm." : "Type your username to confirm.")
                }
                if let error { Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) } }
                Section {
                    Button(role: .destructive) { Task { await delete() } } label: {
                        HStack { Spacer(); if working { ProgressView() } else { Text("Delete my account").bold() }; Spacer() }
                    }
                    .disabled(value.isEmpty || working)
                }
            }
            .navigationTitle("Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Keep my account") { dismiss() } } }
        }
    }

    private func delete() async {
        working = true
        do {
            try await model.change("/api/me", method: "DELETE", json: hasPassword ? ["password": value] : ["confirm": value])
            dismiss()
            await model.forgetSession()
        } catch {
            self.error = error.localizedDescription
        }
        working = false
    }
}
