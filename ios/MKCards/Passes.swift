import CoreImage
import CoreImage.CIFilterBuiltins
import PassKit
import PhotosUI
import SwiftUI
import UIKit
import Vision
import VisionKit

// MARK: - Data

struct PassField: Codable, Hashable {
    var label = ""
    var value = ""
}

struct PassBarcode: Codable, Hashable {
    var format = "qr"
    var value = ""
    var text = ""
}

struct PassColors: Codable, Hashable {
    var bg = "#1f3b73"
    var fg = "#ffffff"
    var label = "#bcd0f5"
}

/// A pass the person made: student ID, travel pass, ticket, membership… (same shape as the server's).
struct Pass: Codable, Identifiable, Hashable {
    var id = ""
    var template = "custom"
    var kind = "generic"
    var transit = "generic"
    var org = ""
    var title = "Pass"
    var header = PassField()
    var primary = PassField()
    var to = PassField()
    var front: [PassField] = []
    var back: [PassField] = []
    var notes = ""
    var barcode = PassBarcode()
    var colors = PassColors()
    var date = ""
    var expires = ""
    var logo = ""
    var photo = ""
    var banner = ""
    var updatedAt: Double?

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func get<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        id = get(.id, ""); template = get(.template, "custom"); kind = get(.kind, "generic"); transit = get(.transit, "generic")
        org = get(.org, ""); title = get(.title, "Pass"); header = get(.header, PassField()); primary = get(.primary, PassField())
        to = get(.to, PassField()); front = get(.front, []); back = get(.back, []); notes = get(.notes, "")
        barcode = get(.barcode, PassBarcode()); colors = get(.colors, PassColors()); date = get(.date, ""); expires = get(.expires, "")
        logo = get(.logo, ""); photo = get(.photo, ""); banner = get(.banner, ""); updatedAt = try? c.decodeIfPresent(Double.self, forKey: .updatedAt)
    }

    var showsBanner: Bool { ["event", "store", "coupon"].contains(kind) }
    var showsPhoto: Bool { ["generic", "event"].contains(kind) }
}

struct PassTemplate: Decodable, Identifiable, Hashable {
    struct Field: Decodable, Hashable {
        var label: String?
        var sample: String?
    }
    let id: String
    let name: String
    let group: String
    let icon: String
    let kind: String
    let transit: String?
    let title: String
    let org: String
    let colors: PassColors
    let header: Field?
    let primary: Field?
    let to: Field?
    let front: [Field]
    let back: [Field]
    let barcode: String

    var kindName: String { PassOptions.kinds.first { $0.0 == kind }?.1 ?? "Pass" }

    func makePass() -> Pass {
        var p = Pass()
        let pair = { (f: Field?) in PassField(label: f?.label ?? "", value: "") }
        p.template = id; p.kind = kind; p.transit = transit ?? "generic"; p.title = title
        p.header = pair(header); p.primary = pair(primary); p.to = pair(to)
        p.front = front.map(pair); p.back = back.map(pair)
        p.barcode = PassBarcode(format: barcode); p.colors = colors
        return p
    }
}

struct PassPalette: Decodable, Hashable {
    let name: String
    let bg: String
    let fg: String
    let label: String
}

struct PassTemplateFile: Decodable {
    let groups: [String]
    let templates: [PassTemplate]
    let palettes: [PassPalette]

    /// The templates shipped with the app (the same file the website uses), so they work offline.
    static let bundled: PassTemplateFile? = {
        guard let url = Bundle.main.url(forResource: "pass-templates", withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(PassTemplateFile.self, from: data)
    }()
}

enum PassOptions {
    static let kinds = [("generic", "Card or ID"), ("event", "Event ticket"), ("transit", "Travel ticket (from → to)"), ("store", "Store or membership card"), ("coupon", "Coupon")]
    static let transits = [("train", "Train"), ("air", "Flight"), ("bus", "Bus or coach"), ("boat", "Ferry"), ("generic", "Other")]
    static let barcodes = [("qr", "QR code"), ("pdf417", "PDF417"), ("aztec", "Aztec"), ("code128", "Code 128"), ("ean13", "EAN-13"), ("code39", "Code 39"), ("none", "No barcode")]

    static func symbol(_ icon: String) -> String {
        [
            "school": "graduationcap.fill", "book": "books.vertical.fill", "backpack": "backpack.fill", "badge": "person.text.rectangle.fill",
            "visitor": "person.fill", "bus": "bus.fill", "train": "tram.fill", "plane": "airplane", "ferry": "ferry.fill", "car": "car.fill",
            "ticket": "ticket.fill", "mic": "mic.fill", "star": "star.fill", "dumbbell": "dumbbell.fill", "users": "person.3.fill",
            "gift": "gift.fill", "tag": "tag.fill", "heart": "heart.fill", "hotel": "bed.double.fill", "medical": "cross.case.fill",
        ][icon] ?? "wallet.pass.fill"
    }

    static func transitSymbol(_ transit: String) -> String {
        ["air": "airplane", "train": "tram.fill", "bus": "bus.fill", "boat": "ferry.fill"][transit] ?? "arrow.right"
    }
}

// MARK: - Pictures (kept on the phone so passes show offline)

enum PassImages {
    private static var cache: [String: UIImage] = [:]

    private static var dir: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("pass-images", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func cached(_ ref: String) -> UIImage? {
        if ref.isEmpty { return nil }
        if let image = cache[ref] { return image }
        if ref.hasPrefix("data:"), let comma = ref.firstIndex(of: ","), let data = Data(base64Encoded: String(ref[ref.index(after: comma)...])), let image = UIImage(data: data) {
            cache[ref] = image
            return image
        }
        let file = dir.appendingPathComponent(ref.replacingOccurrences(of: "/", with: "_"))
        if let data = try? Data(contentsOf: file), let image = UIImage(data: data) {
            cache[ref] = image
            return image
        }
        return nil
    }

    static func load(_ ref: String, site: URL) async -> UIImage? {
        if let image = cached(ref) { return image }
        guard ref.hasPrefix("/media/"), let url = URL(string: ref, relativeTo: site),
              let (data, response) = try? await URLSession.shared.data(from: url), (response as? HTTPURLResponse)?.statusCode == 200,
              let image = UIImage(data: data) else { return nil }
        try? data.write(to: dir.appendingPathComponent(ref.replacingOccurrences(of: "/", with: "_")))
        cache[ref] = image
        return image
    }

    /// Fits or fills a picture to the wallet's size and returns it as a PNG data: URL.
    static func dataURL(_ image: UIImage, kind: String) -> String? {
        let (size, fill): (CGSize, Bool) = kind == "logo" ? (CGSize(width: 480, height: 150), false)
            : kind == "photo" ? (CGSize(width: 270, height: 330), true) : (CGSize(width: 750, height: 246), true)
        let scale = fill ? max(size.width / image.size.width, size.height / image.size.height)
            : min(size.width / image.size.width, size.height / image.size.height, 1)
        let drawn = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let canvas = fill ? size : drawn
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let out = UIGraphicsImageRenderer(size: canvas, format: format).image { _ in
            image.draw(in: CGRect(x: (canvas.width - drawn.width) / 2, y: (canvas.height - drawn.height) / 2, width: drawn.width, height: drawn.height))
        }
        guard let png = out.pngData() else { return nil }
        return "data:image/png;base64," + png.base64EncodedString()
    }
}

struct PassImage: View {
    @EnvironmentObject var model: AppModel
    let ref: String
    var fill = false
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image = image ?? PassImages.cached(ref) {
                Image(uiImage: image).resizable().aspectRatio(contentMode: fill ? .fill : .fit)
            } else {
                Color.clear
            }
        }
        .task(id: ref) { image = await PassImages.load(ref, site: model.site) }
    }
}

// MARK: - Barcodes (drawn on the phone, so they work offline)

enum Barcodes {
    private static let context = CIContext()

    static func image(format: String, value: String) -> UIImage? {
        guard !value.isEmpty, format != "none" else { return nil }
        switch format {
        case "ean13": return bars(ean13(value))
        case "code39": return bars(code39(value.uppercased()))
        default: break
        }
        let output: CIImage?
        switch format {
        case "pdf417":
            let f = CIFilter.pdf417BarcodeGenerator()
            f.message = Data(value.utf8)
            output = f.outputImage
        case "aztec":
            let f = CIFilter.aztecCodeGenerator()
            f.message = Data(value.utf8)
            output = f.outputImage
        case "code128":
            let f = CIFilter.code128BarcodeGenerator()
            f.message = Data(value.utf8)
            f.quietSpace = 0
            output = f.outputImage
        default:
            let f = CIFilter.qrCodeGenerator()
            f.message = Data(value.utf8)
            f.correctionLevel = "M"
            output = f.outputImage
        }
        guard let output, let cg = context.createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }

    /// Draws a row of modules ("1" = bar) as a small image; it is scaled up without smoothing.
    private static func bars(_ modules: String?) -> UIImage? {
        guard let modules, !modules.isEmpty else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: modules.count, height: 40), format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: modules.count, height: 40))
            UIColor.black.setFill()
            for (i, m) in modules.enumerated() where m == "1" { ctx.fill(CGRect(x: i, y: 0, width: 1, height: 40)) }
        }
    }

    static func ean13(_ text: String) -> String? {
        let digits = text.compactMap { $0.wholeNumberValue }
        guard text.count == digits.count, digits.count == 12 || digits.count == 13 else { return nil }
        var d = Array(digits.prefix(12))
        let sum = d.enumerated().reduce(0) { $0 + $1.element * ($1.offset % 2 == 1 ? 3 : 1) }
        d.append((10 - sum % 10) % 10)
        let l = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
        let g = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
        let r = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
        let parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
        let p = Array(parity[d[0]])
        var bits = "101"
        for i in 0..<6 { bits += (p[i] == "L" ? l : g)[d[i + 1]] }
        bits += "01010"
        for i in 0..<6 { bits += r[d[i + 7]] }
        return bits + "101"
    }

    static func code39(_ text: String) -> String? {
        let table: [Character: String] = [
            "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001", "5": "100110000", "6": "001110000",
            "7": "000100101", "8": "100100100", "9": "001100100", "A": "100001001", "B": "001001001", "C": "101001000", "D": "000011001",
            "E": "100011000", "F": "001011000", "G": "000001101", "H": "100001100", "I": "001001100", "J": "000011100", "K": "100000011",
            "L": "001000011", "M": "101000010", "N": "000010011", "O": "100010010", "P": "001010010", "Q": "000000111", "R": "100000110",
            "S": "001000110", "T": "000010110", "U": "110000001", "V": "011000001", "W": "111000000", "X": "010010001", "Y": "110010000",
            "Z": "011010000", "-": "010000101", ".": "110000100", " ": "011000100", "$": "010101000", "/": "010100010", "+": "010001010",
            "%": "000101010", "*": "010010100",
        ]
        var out = ""
        for ch in "*" + text + "*" {
            guard let pattern = table[ch] else { return nil }
            for (i, w) in pattern.enumerated() {
                out += String(repeating: i % 2 == 0 ? "1" : "0", count: w == "1" ? 3 : 1)
            }
            out += "0"
        }
        return String(out.dropLast())
    }
}

struct BarcodeView: View {
    let barcode: PassBarcode
    var big = false

    private var square: Bool { ["qr", "aztec"].contains(barcode.format) }

    var body: some View {
        VStack(spacing: 4) {
            if let image = Barcodes.image(format: barcode.format, value: barcode.value) {
                Image(uiImage: image).interpolation(.none).resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: square ? (big ? 210 : 130) : (big ? 290 : 220), height: square ? (big ? 210 : 130) : (big ? 90 : 64))
            } else {
                Text(barcode.value.isEmpty ? "Barcode appears here" : "This value does not fit a \(PassOptions.barcodes.first { $0.0 == barcode.format }?.1 ?? "") code")
                    .font(.caption).foregroundStyle(.secondary).frame(height: 60)
            }
            let under = barcode.text.isEmpty ? (square ? "" : barcode.value) : barcode.text
            if !under.isEmpty { Text(under).font(.caption.monospaced()).foregroundStyle(.black) }
        }
        .padding(10)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

// MARK: - The pass as it looks in the wallet

struct PassFace: View {
    let pass: Pass
    var big = false
    var withBarcode = true
    var hints: PassTemplate?

    private var fg: Color { Color(hex: pass.colors.fg, fallback: .white) }
    private var label: Color { Color(hex: pass.colors.label, fallback: .white) }

    private func hint(_ f: PassTemplate.Field?) -> String { f?.sample ?? "" }

    @ViewBuilder
    private func field(_ f: PassField, hint: String = "", big: Bool = false, trailing: Bool = false) -> some View {
        if !f.value.isEmpty || !hint.isEmpty {
            VStack(alignment: trailing ? .trailing : .leading, spacing: 2) {
                Text(f.label.uppercased()).font(.system(size: 10, weight: .bold)).kerning(0.6).foregroundStyle(label)
                Text(f.value.isEmpty ? hint : f.value)
                    .font(big ? .system(size: 24, weight: .semibold) : .system(size: 15))
                    .foregroundStyle(fg.opacity(f.value.isEmpty ? 0.5 : 1))
                    .lineLimit(2).minimumScaleFactor(0.7)
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: big ? 16 : 12) {
            HStack(spacing: 10) {
                if !pass.logo.isEmpty { PassImage(ref: pass.logo).frame(maxWidth: 110, maxHeight: 30) }
                Text(pass.org.isEmpty ? pass.title : pass.org).font(.system(size: 15, weight: .semibold)).foregroundStyle(fg).lineLimit(1)
                Spacer(minLength: 4)
                field(pass.header, hint: hint(hints?.header), trailing: true)
            }
            if pass.kind == "transit" {
                HStack {
                    field(pass.primary, hint: hint(hints?.primary), big: true)
                    Spacer()
                    Image(systemName: PassOptions.transitSymbol(pass.transit)).font(.title2).foregroundStyle(label)
                    Spacer()
                    field(pass.to, hint: hint(hints?.to), big: true, trailing: true)
                }
            } else if pass.showsBanner && !pass.banner.isEmpty {
                field(pass.primary, hint: hint(hints?.primary), big: true)
                    .frame(maxWidth: .infinity, minHeight: 90, alignment: .leading)
                    .padding(.horizontal, big ? 20 : 16)
                    .background(PassImage(ref: pass.banner, fill: true).clipped())
                    .padding(.horizontal, big ? -20 : -16)
                    .shadow(color: .black.opacity(0.3), radius: 4)
            } else {
                HStack(alignment: .center) {
                    field(pass.primary, hint: hint(hints?.primary), big: true)
                    Spacer()
                    if pass.showsPhoto && !pass.photo.isEmpty {
                        PassImage(ref: pass.photo, fill: true).frame(width: 64, height: 78).clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
            ForEach(Array(stride(from: 0, to: min(pass.front.count, 4), by: 2)), id: \.self) { i in
                HStack(alignment: .top) {
                    field(pass.front[i], hint: hint(hints?.front[safe: i]))
                    Spacer()
                    if i + 1 < pass.front.count { field(pass.front[i + 1], hint: hint(hints?.front[safe: i + 1]), trailing: true) }
                }
            }
            if withBarcode && pass.barcode.format != "none" {
                BarcodeView(barcode: pass.barcode, big: big).frame(maxWidth: .infinity)
            }
        }
        .padding(big ? 20 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: pass.colors.bg), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

// MARK: - Screens

struct PassesView: View {
    @EnvironmentObject var model: AppModel
    @State private var picking = false
    @State private var editing: PassDraft?

    private var passes: [Pass] { model.me?.passes ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Student and staff IDs, travel passes, tickets, memberships and loyalty cards, in your iPhone and in Apple Wallet.")
                        .foregroundStyle(.secondary)
                    ForEach(passes) { pass in
                        NavigationLink(value: pass.id) { PassFace(pass: pass, withBarcode: false) }.buttonStyle(.plain)
                    }
                    Button { picking = true } label: {
                        VStack(spacing: 8) {
                            Image(systemName: "plus.circle.fill").font(.system(size: 34)).foregroundStyle(Theme.navy)
                            Text(passes.isEmpty ? "Add your first pass" : "Add a pass").font(.headline).foregroundStyle(Theme.ink)
                            Text("Pick a template or design your own").font(.subheadline).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 26)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(style: StrokeStyle(lineWidth: 1.2, dash: [5])).foregroundStyle(.secondary.opacity(0.5)))
                    }
                    .disabled(model.offline)
                }
                .padding(20)
            }
            .background(Theme.page.ignoresSafeArea())
            .navigationTitle("Passes")
            .navigationDestination(for: String.self) { id in PassDetailView(passId: id) }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { picking = true } label: { Image(systemName: "plus") }.disabled(model.offline)
                }
            }
            .refreshable { await model.refresh() }
            .sheet(isPresented: $picking) {
                TemplatePicker { template in
                    picking = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { editing = PassDraft(pass: template.makePass(), template: template) }
                }
            }
            .sheet(item: $editing) { draft in PassEditor(draft: draft) }
        }
    }
}

struct PassDraft: Identifiable {
    let id = UUID()
    var pass: Pass
    var template: PassTemplate?
}

struct TemplatePicker: View {
    @Environment(\.dismiss) private var dismiss
    let onPick: (PassTemplate) -> Void
    private let file = PassTemplateFile.bundled

    var body: some View {
        NavigationStack {
            List {
                ForEach(file?.groups ?? [], id: \.self) { group in
                    Section(group) {
                        ForEach(file?.templates.filter { $0.group == group } ?? []) { t in
                            Button { onPick(t) } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: PassOptions.symbol(t.icon)).font(.title3)
                                        .foregroundStyle(Color(hex: t.colors.fg, fallback: .white))
                                        .frame(width: 46, height: 46)
                                        .background(Color(hex: t.colors.bg), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(t.name).font(.headline).foregroundStyle(Theme.ink)
                                        Text(t.kindName).font(.subheadline).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Choose a template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

struct PassDetailView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let passId: String
    @State private var editing: PassDraft?
    @State private var confirmDelete = false
    @State private var savedBrightness: CGFloat?

    private var pass: Pass? { model.me?.passes?.first { $0.id == passId } }

    var body: some View {
        ScrollView {
            if let pass {
                VStack(spacing: 18) {
                    PassFace(pass: pass, big: true)
                    if model.me?.wallet?.apple == true && PKAddPassesViewController.canAddPasses() {
                        AddPassButton {
                            guard let top = UIApplication.shared.topController else { return }
                            if model.offline { model.alert = "Adding to Apple Wallet needs a connection."; return }
                            Wallet.addPass(from: model.url("/api/passes/\(pass.id)/wallet/apple.pkpass"), presenter: top)
                        }
                        .frame(height: 50)
                    }
                    let details = pass.back.filter { !$0.value.isEmpty } + (pass.notes.isEmpty ? [] : [PassField(label: "Notes", value: pass.notes)])
                    if !details.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("DETAILS").font(.caption.weight(.semibold)).kerning(1.5).foregroundStyle(Theme.gold)
                            ForEach(details, id: \.self) { f in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(f.label).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                                    Text(f.value).textSelection(.enabled)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    Text("A personal copy for convenience, not an official document.").font(.footnote).foregroundStyle(.tertiary)
                }
                .padding(20)
            }
        }
        .background(Theme.page.ignoresSafeArea())
        .navigationTitle(pass?.title ?? "Pass")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button { if let pass { editing = PassDraft(pass: pass, template: PassTemplateFile.bundled?.templates.first { $0.id == pass.template }) } } label: { Label("Edit", systemImage: "pencil") }
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Delete", systemImage: "trash") }
                } label: { Image(systemName: "ellipsis.circle") }
                .disabled(model.offline)
            }
        }
        .confirmationDialog("Delete this pass?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    do {
                        try await model.change("/api/passes/\(passId)", method: "DELETE")
                        await model.refresh()
                        dismiss()
                    } catch { model.alert = error.localizedDescription }
                }
            }
        } message: { Text("A copy already in Apple Wallet stays there until you remove it in Wallet.") }
        .sheet(item: $editing) { draft in PassEditor(draft: draft) }
        // A bright screen makes the barcode easier to scan at gates and tills.
        .onAppear { savedBrightness = UIScreen.main.brightness; UIScreen.main.brightness = 1 }
        .onDisappear { if let savedBrightness { UIScreen.main.brightness = savedBrightness } }
    }
}

struct AddPassButton: UIViewRepresentable {
    let action: () -> Void

    func makeUIView(context: Context) -> PKAddPassButton {
        let button = PKAddPassButton(addPassButtonStyle: .black)
        button.addTarget(context.coordinator, action: #selector(Coordinator.tap), for: .touchUpInside)
        return button
    }

    func updateUIView(_ view: PKAddPassButton, context: Context) { context.coordinator.action = action }
    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func tap() { action() }
    }
}

struct PassEditor: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var draft: PassDraft
    @State private var saving = false
    @State private var error: String?
    @State private var scanning = false
    @State private var pickingFor: String?
    @State private var pickerShown = false
    @State private var pickedItem: PhotosPickerItem?
    @State private var hasDate = false
    @State private var date = Date()
    @State private var hasExpiry = false
    @State private var expiry = Date()

    private var isNew: Bool { draft.pass.id.isEmpty }
    private var palettes: [PassPalette] { PassTemplateFile.bundled?.palettes ?? [] }

    private func pairRow(_ f: Binding<PassField>, hint: String?, labelText: String = "Label", valueText: String = "Value") -> some View {
        HStack {
            TextField(labelText, text: f.label).textInputAutocapitalization(.characters).font(.footnote).frame(maxWidth: 120)
            Divider()
            TextField(hint?.isEmpty == false ? hint! : valueText, text: f.value)
        }
    }

    private func colourBinding(_ key: WritableKeyPath<PassColors, String>) -> Binding<Color> {
        Binding(get: { Color(hex: draft.pass.colors[keyPath: key]) },
                set: { draft.pass.colors[keyPath: key] = $0.hexString })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    PassFace(pass: draft.pass, hints: draft.template).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
                Section("Type and name") {
                    Picker("Layout", selection: $draft.pass.kind) { ForEach(PassOptions.kinds, id: \.0) { Text($0.1).tag($0.0) } }
                    if draft.pass.kind == "transit" {
                        Picker("Travelling by", selection: $draft.pass.transit) { ForEach(PassOptions.transits, id: \.0) { Text($0.1).tag($0.0) } }
                    }
                    TextField(draft.template?.org.isEmpty == false ? draft.template!.org : "Organisation (top of the pass)", text: $draft.pass.org)
                    TextField("Pass name", text: $draft.pass.title)
                }
                Section {
                    pairRow($draft.pass.header, hint: draft.template?.header?.sample)
                } header: { Text("Top corner") }
                Section {
                    if draft.pass.kind == "transit" {
                        pairRow($draft.pass.primary, hint: draft.template?.primary?.sample, labelText: "From (city)", valueText: "Code")
                        pairRow($draft.pass.to, hint: draft.template?.to?.sample, labelText: "To (city)", valueText: "Code")
                    } else {
                        pairRow($draft.pass.primary, hint: draft.template?.primary?.sample)
                    }
                } header: { Text("Main line") }
                Section {
                    ForEach(draft.pass.front.indices, id: \.self) { i in pairRow($draft.pass.front[i], hint: draft.template?.front[safe: i]?.sample) }
                        .onDelete { draft.pass.front.remove(atOffsets: $0) }
                    if draft.pass.front.count < 4 { Button { draft.pass.front.append(PassField()) } label: { Label("Add a field", systemImage: "plus") } }
                } header: { Text("More fields") } footer: { Text("Empty fields are hidden. Swipe left to remove one.") }
                Section("Barcode") {
                    Picker("Kind", selection: $draft.pass.barcode.format) { ForEach(PassOptions.barcodes, id: \.0) { Text($0.1).tag($0.0) } }
                    if draft.pass.barcode.format != "none" {
                        TextField(draft.pass.barcode.format == "ean13" ? "12 or 13 digits" : "What the code holds (card or ticket number)", text: $draft.pass.barcode.value)
                            .keyboardType(draft.pass.barcode.format == "ean13" ? .numberPad : .default)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        TextField("Text under the code (optional)", text: $draft.pass.barcode.text)
                        Button { scanning = true } label: { Label("Scan the barcode on my card", systemImage: "barcode.viewfinder") }
                    }
                }
                Section("Colours") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(palettes, id: \.self) { p in
                                Button { draft.pass.colors = PassColors(bg: p.bg, fg: p.fg, label: p.label) } label: {
                                    Text("Aa").font(.footnote.weight(.bold)).foregroundStyle(Color(hex: p.label))
                                        .frame(width: 38, height: 38)
                                        .background(Color(hex: p.bg), in: RoundedRectangle(cornerRadius: 9))
                                        .overlay(RoundedRectangle(cornerRadius: 9).stroke(draft.pass.colors.bg == p.bg ? Theme.navy : Color.black.opacity(0.08), lineWidth: draft.pass.colors.bg == p.bg ? 2.5 : 1))
                                }.buttonStyle(.plain)
                            }
                        }.padding(.vertical, 4)
                    }
                    ColorPicker("Background", selection: colourBinding(\.bg), supportsOpacity: false)
                    ColorPicker("Text", selection: colourBinding(\.fg), supportsOpacity: false)
                    ColorPicker("Labels", selection: colourBinding(\.label), supportsOpacity: false)
                }
                Section("Pictures") {
                    pictureRow("logo", "Logo")
                    if draft.pass.showsPhoto { pictureRow("photo", "Photo") }
                    if draft.pass.showsBanner { pictureRow("banner", "Banner") }
                }
                Section {
                    Toggle("Date and time", isOn: $hasDate)
                    if hasDate { DatePicker("When", selection: $date) }
                    Toggle("Valid until", isOn: $hasExpiry)
                    if hasExpiry { DatePicker("Last day", selection: $expiry, displayedComponents: .date) }
                } header: { Text("Dates") } footer: { Text("Wallet shows the pass on the lock screen near the time, and greys it out after the last day.") }
                Section {
                    ForEach(draft.pass.back.indices, id: \.self) { i in pairRow($draft.pass.back[i], hint: nil) }
                        .onDelete { draft.pass.back.remove(atOffsets: $0) }
                    if draft.pass.back.count < 12 { Button { draft.pass.back.append(PassField()) } label: { Label("Add a detail", systemImage: "plus") } }
                    TextField("Notes", text: $draft.pass.notes, axis: .vertical).lineLimit(2...6)
                } header: { Text("On the back") } footer: { Text("Passes you make are personal copies for convenience, not official documents.") }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle(isNew ? (draft.template?.name ?? "New pass") : "Edit pass")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else { Button(isNew ? "Create" : "Save") { Task { await save() } }.bold() }
                }
            }
            .photosPicker(isPresented: $pickerShown, selection: $pickedItem, matching: .images)
            .onChange(of: pickedItem) { item in
                guard let item, let kind = pickingFor else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data), let url = PassImages.dataURL(image, kind: kind) {
                        setPicture(kind, url)
                    }
                    pickedItem = nil
                }
            }
            .sheet(isPresented: $scanning) {
                BarcodeScanner { value, format in
                    draft.pass.barcode.value = value
                    draft.pass.barcode.format = format
                    scanning = false
                }
                .ignoresSafeArea()
            }
            .onAppear {
                if let d = ISO8601DateFormatter.withFraction.date(from: draft.pass.date) ?? ISO8601DateFormatter().date(from: draft.pass.date) { hasDate = true; date = d }
                if let d = DateFormatter.day.date(from: draft.pass.expires) { hasExpiry = true; expiry = d }
            }
        }
    }

    private func picture(_ kind: String) -> String {
        kind == "logo" ? draft.pass.logo : kind == "photo" ? draft.pass.photo : draft.pass.banner
    }

    private func setPicture(_ kind: String, _ value: String) {
        switch kind {
        case "logo": draft.pass.logo = value
        case "photo": draft.pass.photo = value
        default: draft.pass.banner = value
        }
    }

    private func pictureRow(_ kind: String, _ title: String) -> some View {
        HStack {
            if picture(kind).isEmpty {
                Image(systemName: "photo").frame(width: 56, height: 40).background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            } else {
                PassImage(ref: picture(kind), fill: kind != "logo").frame(width: 56, height: 40).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            Text(title)
            Spacer()
            Button(picture(kind).isEmpty ? "Add" : "Change") { pickingFor = kind; pickerShown = true }.buttonStyle(.borderless)
            if !picture(kind).isEmpty { Button("Remove", role: .destructive) { setPicture(kind, "") }.buttonStyle(.borderless) }
        }
    }

    private func save() async {
        error = nil
        saving = true
        defer { saving = false }
        var pass = draft.pass
        pass.date = hasDate ? ISO8601DateFormatter().string(from: date) : ""
        pass.expires = hasExpiry ? DateFormatter.day.string(from: expiry) : ""
        do {
            let data = try JSONEncoder().encode(pass)
            guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            if isNew {
                try await model.change("/api/passes", json: ["pass": body])
            } else {
                try await model.change("/api/passes/\(pass.id)", method: "PUT", json: ["pass": body])
            }
            await model.refresh()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Apple's live scanner, reading the barcode from a card or ticket so the pass carries the same code.
struct BarcodeScanner: UIViewControllerRepresentable {
    let onFound: (String, String) -> Void

    func makeUIViewController(context: Context) -> UIViewController {
        guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
            let vc = UIViewController()
            let label = UILabel()
            label.text = "This iPhone cannot scan barcodes here. Type the number printed under the barcode instead."
            label.numberOfLines = 0
            label.textAlignment = .center
            label.translatesAutoresizingMaskIntoConstraints = false
            vc.view.backgroundColor = .systemBackground
            vc.view.addSubview(label)
            NSLayoutConstraint.activate([label.centerYAnchor.constraint(equalTo: vc.view.centerYAnchor),
                                         label.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor, constant: 30),
                                         label.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor, constant: -30)])
            return vc
        }
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr, .pdf417, .aztec, .code128, .ean13, .code39])],
                                                qualityLevel: .accurate, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        // Scanning starts once the camera view is on screen.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { try? scanner.startScanning() }
        return scanner
    }

    func updateUIViewController(_ vc: UIViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onFound: onFound) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onFound: (String, String) -> Void
        private var done = false
        init(onFound: @escaping (String, String) -> Void) { self.onFound = onFound }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for item in addedItems {
                if case .barcode(let code) = item, let value = code.payloadStringValue {
                    done = true
                    dataScanner.stopScanning()
                    let format: String
                    switch code.observation.symbology {
                    case .pdf417: format = "pdf417"
                    case .aztec: format = "aztec"
                    case .code128: format = "code128"
                    case .ean13: format = "ean13"
                    case .code39: format = "code39"
                    default: format = "qr"
                    }
                    onFound(value, format)
                    return
                }
            }
        }
    }
}

extension Color {
    var hexString: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a)
        let v = { (x: CGFloat) in Int((min(max(x, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", v(r), v(g), v(b))
    }
}

extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

extension DateFormatter {
    static let day: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
