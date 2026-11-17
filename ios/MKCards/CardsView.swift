import Charts
import SwiftUI

/// "My cards": every card with its numbers, opening a native detail screen.
struct CardsView: View {
    @EnvironmentObject var model: AppModel
    @State private var page: WebPage?

    private var entries: [Me.Entry] { model.me?.cards ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if entries.isEmpty {
                        VStack(spacing: 14) {
                            Image(systemName: "rectangle.stack.badge.plus").font(.system(size: 46)).foregroundStyle(Theme.navy)
                            Text("Create your first card").font(.title3.bold())
                            Text("Make a card for each audience: work, clients, events.").foregroundStyle(.secondary).multilineTextAlignment(.center)
                            Button("Create a card") { page = newCardPage }.buttonStyle(PrimaryButtonStyle())
                        }
                        .padding(.top, 70)
                    }
                    ForEach(entries) { entry in
                        NavigationLink(value: entry.id) {
                            VStack(alignment: .leading, spacing: 10) {
                                CardTile(entry: entry)
                                HStack(spacing: 16) {
                                    Label("\(entry.views ?? 0) views", systemImage: "eye")
                                    Label("\(entry.saves ?? 0) saves", systemImage: "person.crop.circle.badge.plus")
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                                }
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 6)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(20)
            }
            .background(Theme.page.ignoresSafeArea())
            .navigationTitle("My Cards")
            .navigationDestination(for: String.self) { id in CardDetailView(cardId: id) }
            .toolbar {
                if entries.count < 10 {
                    ToolbarItem(placement: .primaryAction) {
                        Button { page = newCardPage } label: { Image(systemName: "plus.circle.fill").font(.title3) }
                            .accessibilityLabel("New card")
                    }
                }
            }
            .refreshable { await model.refresh() }
            .sheet(item: $page) { WebSheet(page: $0) }
            .onChange(of: model.openPath) { request in
                guard let request, request.tab == .cards else { return }
                page = WebPage(title: request.path == "/new" ? "New card" : "MK Cards", path: request.path, closeOn: ["/share/"])
                model.openPath = nil
            }
            .onAppear {
                if let request = model.openPath, request.tab == .cards {
                    page = WebPage(title: "New card", path: request.path, closeOn: ["/share/"])
                    model.openPath = nil
                }
            }
        }
    }

    private var newCardPage: WebPage { WebPage(title: "New card", path: "/new", closeOn: ["/share/"]) }
}

struct CardDetailView: View {
    @EnvironmentObject var model: AppModel
    let cardId: String
    @State private var stats: CardStats?
    @State private var page: WebPage?
    @State private var confirmStatus = false

    private var entry: Me.Entry? { model.me?.cards.first { $0.id == cardId } }

    var body: some View {
        ScrollView {
            if let entry {
                VStack(alignment: .leading, spacing: 20) {
                    CardTile(entry: entry)
                    Text(model.cardURL(entry).absoluteString.replacingOccurrences(of: "https://", with: ""))
                        .font(.footnote.weight(.medium)).foregroundStyle(.secondary)

                    statsSection

                    VStack(spacing: 0) {
                        row("Edit card", "pencil") { page = WebPage(title: "Edit card", path: "/edit/\(entry.id)", closeOn: ["/share/"]) }
                        Divider().padding(.leading, 52)
                        row("Share and QR code", "qrcode") { model.shareCardId = entry.id; model.tab = .share }
                        Divider().padding(.leading, 52)
                        row("Preview card page", "eye") { page = WebPage(title: entry.card.name, path: model.cardURL(entry).path) }
                        Divider().padding(.leading, 52)
                        row("Email signature", "signature") { page = WebPage(title: "Email signature", path: "/signature/\(entry.id)") }
                        Divider().padding(.leading, 52)
                        row("Video-call background", "video") { page = WebPage(title: "Call background", path: "/background/\(entry.id)") }
                    }
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                    Button(role: entry.isActive ? .destructive : nil) { confirmStatus = true } label: {
                        Label(entry.isActive ? "Turn this card off" : "Turn this card back on", systemImage: "power")
                    }
                    .buttonStyle(PrimaryButtonStyle(light: true))
                }
                .padding(20)
            }
        }
        .background(Theme.page.ignoresSafeArea())
        .navigationTitle(entry?.displayName ?? "Card")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadStats() }
        .refreshable { await model.refresh(); await loadStats() }
        .sheet(item: $page) { WebSheet(page: $0) }
        .confirmationDialog(entry?.isActive == false ? "Turn this card back on?" : "Turn this card off?", isPresented: $confirmStatus, titleVisibility: .visible) {
            Button(entry?.isActive == false ? "Turn on" : "Turn off", role: entry?.isActive == false ? nil : .destructive) { Task { await toggle() } }
        } message: {
            Text(entry?.isActive == false ? "Visitors will see the card again." : "Visitors will see a short notice instead of your details. You can turn it back on at any time.")
        }
    }

    @ViewBuilder private var statsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("LAST 30 DAYS").font(.caption.weight(.semibold)).kerning(1.5).foregroundStyle(Theme.gold)
            if let stats {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    stat(stats.total["view"] ?? 0, "Views")
                    stat(stats.total["save"] ?? 0, "Saves")
                    stat((stats.total["whatsapp"] ?? 0) + (stats.total["call"] ?? 0) + (stats.total["email"] ?? 0), "Calls & messages")
                }
                Chart(stats.series) { day in
                    BarMark(x: .value("Day", day.day), y: .value("Views", day.view))
                        .foregroundStyle(Theme.navy.opacity(0.75))
                    BarMark(x: .value("Day", day.day), y: .value("Saves", day.save))
                        .foregroundStyle(Theme.gold)
                }
                .chartXAxis(.hidden)
                .frame(height: 120)
                HStack(spacing: 14) {
                    Label("Views", systemImage: "square.fill").foregroundStyle(Theme.navy.opacity(0.75))
                    Label("Contact saves", systemImage: "square.fill").foregroundStyle(Theme.gold)
                }
                .font(.caption)
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 80)
            }
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func stat(_ value: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.system(size: 26, weight: .bold, design: .serif)).foregroundStyle(Theme.ink)
            Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 30, height: 30).background(RoundedRectangle(cornerRadius: 8).fill(Theme.navy))
                Text(title).foregroundStyle(Theme.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func loadStats() async {
        stats = try? await model.cachedGet("/api/cards/\(cardId)/stats", name: "stats-\(cardId)", as: CardStats.self)
    }

    private func toggle() async {
        guard let entry else { return }
        do {
            try await model.change("/api/cards/\(entry.id)/status", json: ["active": !entry.isActive, "message": ""])
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await model.refresh()
        } catch {
            model.alert = error.localizedDescription
        }
    }
}
