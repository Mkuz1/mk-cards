import SwiftUI

/// A contact being checked before it is saved.
struct ContactDraft: Identifiable {
    let id = UUID()
    var source = "scan"
    var name = "", title = "", company = "", email = "", mobile = "", phone = "", website = "", address = "", event = "", note = ""

    var json: [String: Any] {
        ["source": source, "name": name, "title": title, "company": company, "email": email, "mobile": mobile, "phone": phone,
         "website": website, "address": address, "event": event, "note": note]
    }
}

/// Native scanning: Apple's document camera for cards (text read on the phone, then tidied by MK Cards), the
/// live QR scanner for badges, or typing someone in.
struct ScanView: View {
    @EnvironmentObject var model: AppModel
    @AppStorage("scanEvent") private var event = ""
    @State private var draft: ContactDraft?
    @State private var reading = false
    @State private var savedName: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Photograph a business card or an event badge. The details are read for you and added to your contacts.")
                        .foregroundStyle(.secondary)
                    option("Business card", "Take a photo; the details are read for you", "rectangle.and.text.magnifyingglass") { scan("card") }
                    option("Event badge", "Point the camera at the badge's QR code", "qrcode.viewfinder") { scan("badge") }
                    option("Type it in", "Add someone by hand", "square.and.pencil") { draft = ContactDraft(source: "manual", event: event) }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("EVENT").font(.caption.weight(.semibold)).kerning(1.5).foregroundStyle(Theme.gold)
                        TextField("e.g. GITEX 2026 (kept for your next scans)", text: $event)
                            .padding(12)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    if let savedName {
                        Label("\(savedName) saved to your contacts", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green).font(.subheadline.weight(.semibold))
                    }
                    Text("Photos are only used to read the details and are not kept. Scanning works offline too: contacts are kept on your iPhone and uploaded later.").font(.footnote).foregroundStyle(.tertiary)
                }
                .padding(20)
            }
            .background(Theme.page.ignoresSafeArea())
            .navigationTitle("Scan")
            .overlay {
                if reading {
                    VStack(spacing: 12) {
                        ProgressView().scaleEffect(1.3)
                        Text("Reading the card…").font(.subheadline.weight(.medium))
                    }
                    .padding(28)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
            .sheet(item: $draft) { item in
                ReviewContactView(draft: item) { name in
                    savedName = name
                    Task { try? await Task.sleep(nanoseconds: 4_000_000_000); savedName = nil }
                }
            }
        }
    }

    private func option(_ title: String, _ detail: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon).font(.system(size: 24, weight: .medium)).foregroundStyle(.white)
                    .frame(width: 54, height: 54)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(LinearGradient(colors: [Color(red: 0.114, green: 0.239, blue: 0.439), Theme.navy], startPoint: .top, endPoint: .bottom)))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline).foregroundStyle(Theme.ink)
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: Theme.navy.opacity(0.06), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }

    private func scan(_ kind: String) {
        guard let top = UIApplication.shared.topController else { return }
        CardScanner.shared.scan(kind: kind, from: top) { result in
            guard let result else { return }
            Task { await read(result) }
        }
    }

    private func read(_ result: CardScanner.Result) async {
        reading = true
        defer { reading = false }
        if !result.qr.isEmpty, var found = await QRContact.parse(result.qr, model: model), !found.name.isEmpty || !found.email.isEmpty {
            found.source = "badge"
            found.event = event
            draft = found
            return
        }
        guard !result.image.isEmpty || !result.text.isEmpty else {
            draft = ContactDraft(source: "badge", event: event, note: result.qr)
            return
        }
        do {
            let reply = try await model.change("/api/scan/read", json: ["image": result.image, "text": result.text])
            var d = ContactDraft(source: "scan", event: event)
            if let f = reply["fields"] as? [String: Any] {
                d.name = f["name"] as? String ?? ""
                d.title = f["title"] as? String ?? ""
                d.company = f["company"] as? String ?? ""
                d.address = f["address"] as? String ?? ""
                d.website = (f["website"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? (f["linkedin"] as? String ?? "")
                let emails = f["emails"] as? [String] ?? []
                d.email = emails.first ?? ""
                let phones = f["phones"] as? [[String: String]] ?? []
                d.mobile = phones.first { $0["label"] == "mobile" }?["value"] ?? ""
                d.phone = phones.first { $0["label"] != "mobile" }?["value"] ?? ""
                d.note = [f["department"] as? String, emails.dropFirst().joined(separator: ", ")].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n")
            }
            draft = d
        } catch {
            // Offline (or the reader failed): use what the iPhone itself read from the card.
            if case AppError.offline = error { model.offline = true } else { model.alert = error.localizedDescription }
            draft = QRContact.fromText(result.text, event: event)
        }
    }
}

struct ReviewContactView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var draft: ContactDraft
    let onSaved: (String) -> Void
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $draft.name).textContentType(.name)
                    TextField("Job title", text: $draft.title).textContentType(.jobTitle)
                    TextField("Company", text: $draft.company).textContentType(.organizationName)
                } footer: {
                    if draft.source != "manual" { Text("Correct anything that was misread before saving.") }
                }
                Section {
                    TextField("Email", text: $draft.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Mobile", text: $draft.mobile).keyboardType(.phonePad)
                    TextField("Phone", text: $draft.phone).keyboardType(.phonePad)
                    TextField("Website", text: $draft.website).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Address", text: $draft.address)
                }
                Section {
                    TextField("Event", text: $draft.event)
                    TextField("Note: what did you talk about?", text: $draft.note, axis: .vertical).lineLimit(2...5)
                }
                if let error { Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) } }
            }
            .navigationTitle(draft.source == "manual" ? "New contact" : "Check the details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: { if saving { ProgressView() } else { Text("Save").bold() } }
                        .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        error = nil
        do {
            try await model.change("/api/contacts", json: draft.json)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onSaved(draft.name)
            dismiss()
        } catch AppError.offline {
            // No connection: keep it on the phone and send it later.
            model.queueContact(draft.json)
            model.offline = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onSaved("\(draft.name) (on this iPhone until you're back online)")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

/// Reads contact details from a QR code: a vCard, a MECARD, or an MK Cards link.
@MainActor
enum QRContact {
    static func parse(_ value: String, model: AppModel) async -> ContactDraft? {
        let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.uppercased().hasPrefix("BEGIN:VCARD") { return vCard(v) }
        if v.uppercased().hasPrefix("MECARD:") { return meCard(v) }
        if let url = URL(string: v), url.scheme?.hasPrefix("http") == true {
            if url.host == model.site.host {
                let parts = url.path.split(separator: "/").map(String.init)
                if (1...2).contains(parts.count) {
                    struct Reply: Decodable {
                        struct Entry: Decodable { let label: String?; let value: String }
                        struct Card: Decodable { let name: String; let title: String?; let company: String?; let website: String?; let address: String?; let phones: [Entry]?; let emails: [Entry]? }
                        let card: Card?
                    }
                    let path = "/api/public/card?u=\(parts[0])&s=\(parts.count > 1 ? parts[1] : "")"
                    if let card = try? await model.get(path, as: Reply.self).card {
                        var d = ContactDraft()
                        d.name = card.name; d.title = card.title ?? ""; d.company = card.company ?? ""
                        d.email = card.emails?.first?.value ?? ""
                        d.mobile = card.phones?.first { $0.label == "mobile" }?.value ?? ""
                        d.phone = card.phones?.first { $0.label != "mobile" }?.value ?? ""
                        d.website = card.website ?? v; d.address = card.address ?? ""
                        return d
                    }
                }
            }
            var d = ContactDraft()
            d.website = v
            return d
        }
        var d = ContactDraft()
        d.note = String(v.prefix(400))
        return d
    }

    private static func unescape(_ s: Substring) -> String {
        String(s).replacingOccurrences(of: "\\n", with: "\n").replacingOccurrences(of: "\\,", with: ",").replacingOccurrences(of: "\\;", with: ";")
            .trimmingCharacters(in: .whitespaces)
    }

    static func vCard(_ text: String) -> ContactDraft {
        var d = ContactDraft()
        let unfolded = text.replacingOccurrences(of: "\r\n ", with: "").replacingOccurrences(of: "\n ", with: "")
        for line in unfolded.components(separatedBy: .newlines) {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let head = line[..<colon].uppercased()
            let value = unescape(line[line.index(after: colon)...])
            var key = head.split(separator: ";").first.map(String.init) ?? ""
            if let dot = key.firstIndex(of: "."), key.hasPrefix("ITEM") { key = String(key[key.index(after: dot)...]) }
            switch key {
            case "FN": d.name = value
            case "N" where d.name.isEmpty: d.name = value.split(separator: ";").prefix(2).reversed().joined(separator: " ").trimmingCharacters(in: .whitespaces)
            case "ORG": d.company = value.split(separator: ";").first.map(String.init) ?? value
            case "TITLE": d.title = value
            case "EMAIL" where d.email.isEmpty: d.email = value
            case "TEL":
                if head.contains("CELL") && d.mobile.isEmpty { d.mobile = value } else if d.phone.isEmpty { d.phone = value }
            case "URL" where d.website.isEmpty && !value.contains("wa.me"): d.website = value
            case "ADR" where d.address.isEmpty: d.address = value.split(separator: ";").filter { !$0.isEmpty }.joined(separator: ", ")
            case "NOTE": d.note = value
            default: break
            }
        }
        return d
    }

    static func meCard(_ text: String) -> ContactDraft {
        var d = ContactDraft()
        for part in text.dropFirst(7).split(separator: ";") {
            guard let colon = part.firstIndex(of: ":") else { continue }
            let key = part[..<colon].uppercased()
            let value = unescape(part[part.index(after: colon)...])
            switch key {
            case "N": d.name = value.contains(",") ? value.split(separator: ",").reversed().joined(separator: " ") : value
            case "TEL" where d.phone.isEmpty: d.phone = value
            case "EMAIL": d.email = value
            case "URL": d.website = value
            case "ADR": d.address = value
            case "ORG": d.company = value
            case "NOTE": d.note = value
            default: break
            }
        }
        return d
    }

    /// A rough reading of the card's text, used only when MK Cards cannot be reached.
    static func fromText(_ text: String, event: String) -> ContactDraft {
        var d = ContactDraft(source: "scan", event: event)
        let lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        d.email = lines.first { $0.contains("@") && $0.contains(".") } ?? ""
        let phones = lines.filter { $0.filter(\.isNumber).count >= 7 && !$0.contains("@") }
        d.mobile = phones.first ?? ""
        d.phone = phones.dropFirst().first ?? ""
        d.website = lines.first { $0.lowercased().hasPrefix("www.") || $0.lowercased().hasPrefix("http") } ?? ""
        d.name = lines.first { line in
            let words = line.split(separator: " ")
            return (2...4).contains(words.count) && !line.contains(where: \.isNumber) && !line.contains("@")
        } ?? ""
        return d
    }
}
