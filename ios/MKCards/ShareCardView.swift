import CoreImage.CIFilterBuiltins
import PassKit
import SwiftUI

/// Native sharing: the card's QR code full-size (screen brightened for scanning), the share sheet,
/// Apple Wallet and NFC tags.
struct ShareCardView: View {
    @EnvironmentObject var model: AppModel
    @State private var savedBrightness: CGFloat?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    if let me = model.me, !me.cards.isEmpty {
                        let entries = me.cards
                        let entry = entries.first { $0.id == model.shareCardId } ?? entries[0]
                        let link = model.cardURL(entry)
                        if entries.count > 1 {
                            Picker("Card", selection: Binding(get: { entry.id }, set: { model.shareCardId = $0 })) {
                                ForEach(entries) { e in Text(e.displayName).tag(e.id) }
                            }
                            .pickerStyle(.segmented)
                        }
                        QRCardView(entry: entry, link: link)
                        ShareLink(item: link, subject: Text("\(entry.card.name) — MK Cards"), message: Text("Here is my card")) {
                            Label("Share my card", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        Button {
                            UIPasteboard.general.url = link
                            UINotificationFeedbackGenerator().notificationOccurred(.success)
                        } label: {
                            Label("Copy link", systemImage: "doc.on.doc")
                        }
                        .buttonStyle(PrimaryButtonStyle(light: true))
                        if me.wallet?.apple == true, PKAddPassesViewController.canAddPasses() {
                            AddToWalletButton(passURL: model.url("/api/cards/\(entry.id)/wallet/apple.pkpass"))
                                .frame(height: 52)
                                .id(entry.id)
                        }
                        if NFCWriter.isAvailable {
                            Button { NFCWriter.shared.write(link) } label: {
                                Label("Write to an NFC tag", systemImage: "wave.3.right")
                            }
                            .buttonStyle(PrimaryButtonStyle(light: true))
                        }
                        Text("Anyone can scan the code with their phone camera to open your card and save your contact. No app needed.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    } else {
                        VStack(spacing: 14) {
                            Image(systemName: "rectangle.stack.badge.plus").font(.system(size: 44)).foregroundStyle(Theme.navy)
                            Text("Create your first card").font(.title3.bold())
                            Text("Your QR code appears here once you have a card.").foregroundStyle(.secondary)
                            Button("Create a card") {
                                model.tab = .cards
                                model.openPath = PageRequest(tab: .cards, path: "/new")
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        }
                        .padding(.top, 60)
                    }
                }
                .padding(20)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.page.ignoresSafeArea())
            .navigationTitle("Share")
            .refreshable { await model.refresh() }
        }
        .onAppear {
            Task { await model.refresh() }
            savedBrightness = UIScreen.main.brightness
            UIScreen.main.brightness = max(UIScreen.main.brightness, 0.9)
        }
        .onDisappear {
            if let savedBrightness { UIScreen.main.brightness = savedBrightness }
        }
    }
}

/// The QR code on a white card with the holder's name, in the app's navy and gold.
struct QRCardView: View {
    let entry: Me.Entry
    let link: URL

    var body: some View {
        VStack(spacing: 14) {
            VStack(spacing: 4) {
                if let company = entry.card.company, !company.isEmpty {
                    Text(company.uppercased()).font(.system(size: 12, weight: .semibold)).kerning(2.4).foregroundStyle(Theme.softGold)
                }
                Text(entry.card.name).font(.system(size: 26, weight: .bold, design: .serif)).foregroundStyle(.white).multilineTextAlignment(.center)
                if let title = entry.card.title, !title.isEmpty {
                    Text(title).font(.subheadline).foregroundStyle(.white.opacity(0.8)).multilineTextAlignment(.center)
                }
                Rectangle().fill(Theme.softGold).frame(width: 40, height: 2).padding(.top, 6)
            }
            if let image = QRCode.image(link.absoluteString) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .padding(16)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .frame(maxWidth: 280)
                    .accessibilityLabel("QR code for \(entry.card.name)'s card")
            }
            Text(link.absoluteString.replacingOccurrences(of: "https://", with: ""))
                .font(.footnote.weight(.medium))
                .foregroundStyle(.white.opacity(0.75))
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(22)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                LinearGradient(colors: [Color(red: 0.13, green: 0.25, blue: 0.45), Theme.deep], startPoint: .topLeading, endPoint: .bottomTrailing)
                RadialGradient(colors: [Color.white.opacity(0.18), .clear], center: .topLeading, startRadius: 0, endRadius: 260)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.softGold.opacity(0.4), lineWidth: 1))
        .shadow(color: Theme.navy.opacity(0.35), radius: 24, y: 14)
    }
}

enum QRCode {
    static func image(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Apple's own "Add to Apple Wallet" button, for the pass of the card on show.
struct AddToWalletButton: UIViewRepresentable {
    let passURL: URL

    final class Coordinator {
        var passURL: URL
        init(_ url: URL) { passURL = url }
        @objc func add() {
            guard let top = UIApplication.shared.topController else { return }
            Wallet.addPass(from: passURL, presenter: top)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(passURL) }

    func makeUIView(context: Context) -> PKAddPassButton {
        let button = PKAddPassButton(addPassButtonStyle: .black)
        button.addTarget(context.coordinator, action: #selector(Coordinator.add), for: .touchUpInside)
        return button
    }

    // The selected card can change while the button stays on screen, so the address is kept up to date.
    func updateUIView(_ view: PKAddPassButton, context: Context) {
        context.coordinator.passURL = passURL
    }
}
