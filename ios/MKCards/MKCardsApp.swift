import SwiftUI

@main
struct MKCardsApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .tint(Theme.navy)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                SplashView()
            case .signedOut:
                WelcomeView()
            case .signedIn:
                MainTabs().preferredColorScheme(.light)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.phase)
        .task { await model.refresh() }
        .alert("MK Cards", isPresented: Binding(get: { model.alert != nil }, set: { if !$0 { model.alert = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.alert ?? "")
        }
    }
}

enum Theme {
    static let navy = Color(red: 0.059, green: 0.137, blue: 0.263)       // #0f2343
    static let deep = Color(red: 0.043, green: 0.102, blue: 0.200)       // #0b1a33
    static let gold = Color(red: 0.690, green: 0.537, blue: 0.184)       // #b0892f
    static let softGold = Color(red: 0.835, green: 0.718, blue: 0.341)   // #d5b757
    static let page = Color(red: 0.933, green: 0.945, blue: 0.965)       // #eef1f6
    static let ink = Color(red: 0.051, green: 0.106, blue: 0.200)        // #0d1b33

    static var night: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.11, green: 0.22, blue: 0.40), deep, Color(red: 0.03, green: 0.07, blue: 0.15)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [Color.white.opacity(0.18), .clear], center: .topLeading, startRadius: 0, endRadius: 420)
            RadialGradient(colors: [softGold.opacity(0.16), .clear], center: .bottomTrailing, startRadius: 0, endRadius: 380)
        }
        .ignoresSafeArea()
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Theme.night
            Image("Logo").resizable().scaledToFit().frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

/// Big rounded buttons in the app's navy, gold-edged style.
struct PrimaryButtonStyle: ButtonStyle {
    var light = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(light ? Theme.ink : .white)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(light ? AnyShapeStyle(Color.white) : AnyShapeStyle(LinearGradient(colors: [Color(red: 0.114, green: 0.239, blue: 0.439), Theme.navy], startPoint: .top, endPoint: .bottom)))
            )
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(light ? Color.black.opacity(0.08) : Theme.softGold.opacity(0.35), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct GlassButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(.white)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.25), lineWidth: 1))
            .environment(\.colorScheme, .dark)
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}
