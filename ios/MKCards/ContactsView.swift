import Contacts
import ContactsUI
import SwiftUI

/// Everyone the user met, with search, swipe to delete, save to iPhone Contacts and send to Salesforce.
struct ContactsView: View {
    @EnvironmentObject var model: AppModel
    @State private var contacts: [Contact] = []
    @State private var crm: CRMState?
    @State private var query = ""
    @State private var loaded = false
    @State private var page: WebPage?

    private var shown: [Contact] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return contacts }
        return contacts.filter { [$0.name, $0.company, $0.email, $0.title, $0.event].compactMap { $0 }.joined(separator: " ").lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let crm {
                    Section {
                        Button { page = WebPage(title: "Salesforce", path: "/contacts") } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "cloud.fill").foregroundStyle(.white)
                                    .frame(width: 32, height: 32)
                                    .background(RoundedRectangle(cornerRadius: 8).fill(LinearGradient(colors: [Color(red: 0.09, green: 0.6, blue: 0.76), Color(red: 0.04, green: 0.44, blue: 0.64)], startPoint: .top, endPoint: .bottom)))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Salesforce").foregroundStyle(Theme.ink).fontWeight(.semibold)
                                    Text(crm.connected ? "Connected\(crm.userName.map { " as \($0)" } ?? "")" : crm.canManage ? "Not connected: tap to connect" : "Your company has not connected it")
                                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer()
                                if crm.connected { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                            }
                        }
                    }
                }
                Section {
                    if loaded && contacts.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "person.2.circle").font(.system(size: 44)).foregroundStyle(Theme.navy)
                            Text("No contacts yet").font(.headline)
                            Text("Scan business cards and badges, or let visitors share their details on your card page.")
                                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                            Button("Scan a card") { model.showScan = true }.buttonStyle(PrimaryButtonStyle()).padding(.top, 6)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 24)
                        .listRowBackground(Color.clear)
                    }
                    ForEach(shown) { contact in
                        NavigationLink(value: contact) { ContactRow(contact: contact) }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { Task { await remove(contact) } } label: { Label("Delete", systemImage: "trash") }
                            }
                            .swipeActions(edge: .leading) {
                                Button { ContactSaver.present(contact) } label: { Label("Save", systemImage: "person.crop.circle.badge.plus") }
                                    .tint(Theme.navy)
                            }
                    }
                } header: {
                    if !contacts.isEmpty { Text("\(contacts.count) contact\(contacts.count == 1 ? "" : "s")") }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.page.ignoresSafeArea())
            .navigationTitle("Contacts")
            .searchable(text: $query, prompt: "Search contacts")
            .navigationDestination(for: Contact.self) { contact in
                ContactDetailView(contact: contact, crmConnected: crm?.connected == true) { updated in
                    if let i = contacts.firstIndex(where: { $0.id == updated.id }) { contacts[i] = updated }
                } onDelete: { Task { await remove(contact) } }
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { model.showScan = true } label: { Label("Scan a card", systemImage: "viewfinder") }
                        Button { Task { await exportCSV() } } label: { Label("Export as spreadsheet (CSV)", systemImage: "square.and.arrow.up") }
                    } label: { Image(systemName: "ellipsis.circle").font(.title3) }
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .onChange(of: model.tab) { tab in if tab == .contacts { Task { await load() } } }
            .sheet(item: $page, onDismiss: { Task { await load() } }) { WebSheet(page: $0) }
        }
    }

    private func load() async {
        do {
            struct Reply: Decodable { let contacts: [Contact] }
            await model.flushPending()
            contacts = model.pendingContacts + (try await model.cachedGet("/api/contacts", name: "contacts", as: Reply.self).contacts)
        } catch {
            contacts = model.pendingContacts + contacts.filter { $0.id > 0 }
            if !loaded, !model.offline { model.alert = error.localizedDescription }
        }
        crm = try? await model.get("/api/crm", as: CRMState.self)
        loaded = true
    }

    private func remove(_ contact: Contact) async {
        do {
            try await model.change("/api/contacts/\(contact.id)", method: "DELETE")
            contacts.removeAll { $0.id == contact.id }
        } catch {
            model.alert = error.localizedDescription
        }
    }

    private func exportCSV() async {
        do {
            let (data, _) = try await model.send("/api/contacts.csv")
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("mkcards-contacts.csv")
            try data.write(to: file)
            presentShareSheet([file])
        } catch {
            model.alert = error.localizedDescription
        }
    }
}

struct ContactRow: View {
    let contact: Contact

    var body: some View {
        HStack(spacing: 12) {
            Text(initials(contact.name))
                .font(.system(size: 15, weight: .bold, design: .serif)).foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(Circle().fill(LinearGradient(colors: [Color(red: 0.114, green: 0.239, blue: 0.439), Theme.navy], startPoint: .top, endPoint: .bottom)))
            VStack(alignment: .leading, spacing: 2) {
                Text(contact.name).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                if !contact.role.isEmpty { Text(contact.role).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
                if contact.id < 0 {
                    Label("Waiting to upload", systemImage: "icloud.and.arrow.up").font(.caption).foregroundStyle(.orange)
                } else {
                    Text([contact.date.formatted(date: .abbreviated, time: .omitted), contact.event].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
            if contact.crm != nil { Image(systemName: "cloud.fill").font(.caption).foregroundStyle(Color(red: 0.09, green: 0.6, blue: 0.76)) }
        }
        .padding(.vertical, 2)
    }
}

struct ContactDetailView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var contact: Contact
    let crmConnected: Bool
    let onChange: (Contact) -> Void
    let onDelete: () -> Void
    @State private var sending = false
    @State private var sentId: String?

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Text(initials(contact.name))
                        .font(.system(size: 28, weight: .bold, design: .serif)).foregroundStyle(.white)
                        .frame(width: 76, height: 76)
                        .background(Circle().fill(LinearGradient(colors: [Color(red: 0.114, green: 0.239, blue: 0.439), Theme.navy], startPoint: .top, endPoint: .bottom)))
                        .overlay(Circle().stroke(Theme.softGold, lineWidth: 1.5))
                    Text(contact.name).font(.title2.bold())
                    if !contact.role.isEmpty { Text(contact.role).foregroundStyle(.secondary).multilineTextAlignment(.center) }
                    HStack(spacing: 22) {
                        if let phone = contact.mobile ?? contact.phone { action("phone.fill", "Call", "tel:\(phone.filter { "+0123456789".contains($0) })") }
                        if let phone = contact.mobile ?? contact.phone { action("message.fill", "Message", "sms:\(phone.filter { "+0123456789".contains($0) })") }
                        if let email = contact.email { action("envelope.fill", "Email", "mailto:\(email)") }
                    }
                    .padding(.top, 6)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
            Section {
                field("Mobile", contact.mobile)
                field("Phone", contact.phone)
                field("Email", contact.email)
                field("Website", contact.website)
                field("Address", contact.address)
                field("Event", contact.event)
                field("Note", contact.note)
                field("Source", "\(contact.sourceLabel), \(contact.date.formatted(date: .long, time: .omitted))")
            }
            Section {
                Button { ContactSaver.present(contact) } label: { Label("Save to iPhone Contacts", systemImage: "person.crop.circle.badge.plus") }
                if crmConnected && contact.id > 0 {
                    if contact.crm != nil || sentId != nil {
                        Label("In Salesforce", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    } else {
                        Button { Task { await sendToCRM() } } label: {
                            HStack { Label("Send to Salesforce", systemImage: "cloud"); if sending { Spacer(); ProgressView() } }
                        }
                        .disabled(sending)
                        if let error = contact.crmError, !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red) }
                    }
                }
            }
            if contact.id > 0 {
                Section {
                    Button("Delete contact", role: .destructive) { onDelete(); dismiss() }
                }
            } else {
                Section { Text("Saved on this iPhone. It uploads when you're back online.").font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func field(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(.secondary)
                Text(value).textSelection(.enabled)
            }
        }
    }

    private func action(_ icon: String, _ label: String, _ link: String) -> some View {
        Button {
            if let url = URL(string: link) { UIApplication.shared.open(url) }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 17)).foregroundStyle(.white)
                    .frame(width: 46, height: 46).background(Circle().fill(Theme.navy))
                Text(label).font(.caption).foregroundStyle(Theme.navy)
            }
        }
        .buttonStyle(.plain)
    }

    private func sendToCRM() async {
        sending = true
        defer { sending = false }
        do {
            let reply = try await model.change("/api/contacts/\(contact.id)/crm")
            sentId = reply["id"] as? String ?? "sent"
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            model.alert = error.localizedDescription
        }
    }
}

/// Shows the system's "Create New Contact / Add to Existing Contact" card for a contact.
enum ContactSaver {
    static func present(_ c: Contact) {
        let person = CNMutableContact()
        let parts = c.name.split(separator: " ")
        if parts.count > 1 {
            person.givenName = parts.dropLast().joined(separator: " ")
            person.familyName = String(parts.last!)
        } else {
            person.givenName = c.name
        }
        person.jobTitle = c.title ?? ""
        person.organizationName = c.company ?? ""
        var phones: [CNLabeledValue<CNPhoneNumber>] = []
        if let m = c.mobile, !m.isEmpty { phones.append(CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: m))) }
        if let p = c.phone, !p.isEmpty { phones.append(CNLabeledValue(label: CNLabelWork, value: CNPhoneNumber(stringValue: p))) }
        person.phoneNumbers = phones
        if let e = c.email, !e.isEmpty { person.emailAddresses = [CNLabeledValue(label: CNLabelWork, value: e as NSString)] }
        if let w = c.website, !w.isEmpty { person.urlAddresses = [CNLabeledValue(label: CNLabelWork, value: w as NSString)] }
        person.note = [c.note, c.event.map { "Met at \($0)" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n")
        let card = CNContactViewController(forUnknownContact: person)
        card.contactStore = CNContactStore()
        card.allowsActions = false
        let nav = UINavigationController(rootViewController: card)
        card.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak nav] _ in nav?.dismiss(animated: true) })
        UIApplication.shared.topController?.present(nav, animated: true)
    }
}
