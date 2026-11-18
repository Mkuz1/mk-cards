import SwiftUI
import UIKit

/// The signed-in app: native screens in a tab bar. The full card editor and a few extra tools open the
/// MK Cards pages in a sheet.
struct MainTabs: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            if model.offline { OfflineBanner() }
            tabs
        }
        .animation(.easeInOut(duration: 0.2), value: model.offline)
    }

    private var tabs: some View {
        TabView(selection: $model.tab) {
            CardsView()
                .tabItem { Label("Cards", systemImage: "rectangle.stack") }
                .tag(Tab.cards)
            ShareCardView()
                .tabItem { Label("Share", systemImage: "qrcode") }
                .tag(Tab.share)
            PassesView()
                .tabItem { Label("Passes", systemImage: "wallet.pass") }
                .tag(Tab.passes)
            ContactsView()
                .tabItem { Label("Contacts", systemImage: "person.2") }
                .tag(Tab.contacts)
            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(Tab.account)
        }
        .tint(Theme.navy)
        // Scanning cards and badges opens over any tab (from Cards and Contacts).
        .sheet(isPresented: $model.showScan) { ScanView() }
        .onChange(of: model.tab) { tab in
            if tab == .scan { model.tab = .contacts; model.showScan = true }
        }
    }
}

/// Shown while there is no connection: the app keeps working with the copy saved on the phone.
struct OfflineBanner: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
            Text(model.pending.isEmpty ? "Offline: showing your saved cards and contacts."
                 : "Offline: \(model.pending.count) contact\(model.pending.count == 1 ? "" : "s") waiting to upload.")
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer()
            Button("Retry") { Task { await model.refresh() } }.font(.footnote.weight(.semibold))
        }
        .font(.footnote)
        .foregroundStyle(Color(red: 0.42, green: 0.29, blue: 0))
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(Color(red: 1, green: 0.96, blue: 0.84))
    }
}

/// A page of the MK Cards site, opened as a sheet with a Done button.
struct WebPage: Identifiable {
    let id = UUID()
    let title: String
    let path: String
    /// Close the sheet when the page moves to an address starting with one of these (for example after saving).
    var closeOn: [String] = []
}

struct WebSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let page: WebPage

    var body: some View {
        NavigationStack {
            WebPageView(path: page.path) { path in
                if page.closeOn.contains(where: { path.hasPrefix($0) }) {
                    Task { await model.refresh() }
                    dismiss()
                }
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle(page.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        Task { await model.refresh() }
                        dismiss()
                    }
                }
            }
        }
    }
}

struct WebPageView: UIViewControllerRepresentable {
    @EnvironmentObject var model: AppModel
    let path: String
    var onPath: ((String) -> Void)?

    func makeUIViewController(context: Context) -> WebController {
        WebController(model: model, path: path, onPath: onPath)
    }

    func updateUIViewController(_ controller: WebController, context: Context) {}
}

// MARK: - Shared pieces

extension Color {
    init(hex: String?, fallback: Color = Theme.navy) {
        guard let hex, hex.count == 7, hex.hasPrefix("#"), let value = Int(hex.dropFirst(), radix: 16) else {
            self = fallback
            return
        }
        self = Color(red: Double((value >> 16) & 0xff) / 255, green: Double((value >> 8) & 0xff) / 255, blue: Double(value & 0xff) / 255)
    }
}

func initials(_ name: String) -> String {
    let parts = name.split(separator: " ").prefix(2)
    let letters = parts.compactMap { $0.first.map(String.init) }.joined()
    return letters.isEmpty ? "MK" : letters.uppercased()
}

/// The card in its own colours: a deep shade of its accent, a soft highlight and a gold rule, like the card page.
struct CardTile: View {
    let entry: Me.Entry
    var compact = false

    private var accent: Color { Color(hex: entry.card.accent) }

    var body: some View {
        HStack(spacing: 14) {
            Text(initials(entry.card.name))
                .font(.system(size: compact ? 17 : 20, weight: .bold, design: .serif))
                .foregroundStyle(.white)
                .frame(width: compact ? 46 : 56, height: compact ? 46 : 56)
                .background(Circle().fill(Color.white.opacity(0.08)))
                .overlay(Circle().stroke(Theme.softGold, lineWidth: 1.5))
            VStack(alignment: .leading, spacing: 3) {
                if let company = entry.card.company, !company.isEmpty {
                    Text(company.uppercased()).font(.system(size: 10.5, weight: .semibold)).kerning(1.8).foregroundStyle(Theme.softGold).lineLimit(1)
                }
                Text(entry.card.name).font(.system(size: compact ? 18 : 21, weight: .bold, design: .serif)).foregroundStyle(.white).lineLimit(1)
                if let title = entry.card.title, !title.isEmpty {
                    Text(title).font(.subheadline).foregroundStyle(.white.opacity(0.8)).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                Text(entry.displayName.uppercased())
                    .font(.system(size: 10, weight: .bold)).kerning(0.8)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(Color.white.opacity(0.15)))
                    .foregroundStyle(.white)
                if !entry.isActive {
                    Text("OFF").font(.system(size: 10, weight: .bold))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(Color.red.opacity(0.8))).foregroundStyle(.white)
                }
            }
        }
        .padding(compact ? 14 : 18)
        .background(
            ZStack {
                LinearGradient(colors: [accent.opacity(0.9), Theme.deep], startPoint: .topLeading, endPoint: .bottomTrailing)
                LinearGradient(colors: [Theme.deep.opacity(0.35), .clear], startPoint: .bottom, endPoint: .top)
                RadialGradient(colors: [Color.white.opacity(0.18), .clear], center: .topLeading, startRadius: 0, endRadius: 220)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.softGold.opacity(0.35), lineWidth: 1))
        .shadow(color: Theme.navy.opacity(0.25), radius: 14, y: 8)
        .opacity(entry.isActive ? 1 : 0.7)
    }
}

/// Presents a system share sheet from SwiftUI.
func presentShareSheet(_ items: [Any]) {
    guard let top = UIApplication.shared.topController else { return }
    let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
    sheet.popoverPresentationController?.sourceView = top.view
    top.present(sheet, animated: true)
}
