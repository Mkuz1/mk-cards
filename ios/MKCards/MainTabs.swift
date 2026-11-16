import SwiftUI

/// The signed-in app: a native tab bar over the MK Cards pages, with native Share and scanning.
struct MainTabs: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        TabView(selection: $model.tab) {
            WebTab(tab: .cards)
                .tabItem { Label("Cards", systemImage: "rectangle.stack") }
                .tag(Tab.cards)
            ShareCardView()
                .tabItem { Label("Share", systemImage: "qrcode") }
                .tag(Tab.share)
            WebTab(tab: .scan)
                .tabItem { Label("Scan", systemImage: "viewfinder") }
                .tag(Tab.scan)
            WebTab(tab: .contacts)
                .tabItem { Label("Contacts", systemImage: "person.2") }
                .tag(Tab.contacts)
            WebTab(tab: .account)
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(Tab.account)
        }
        .onAppear {
            let look = UITabBarAppearance()
            look.configureWithDefaultBackground()
            UITabBar.appearance().standardAppearance = look
            UITabBar.appearance().scrollEdgeAppearance = look
        }
    }
}

/// One tab showing a page of the MK Cards site.
struct WebTab: UIViewControllerRepresentable {
    @EnvironmentObject var model: AppModel
    let tab: Tab

    func makeUIViewController(context: Context) -> WebController {
        WebController(model: model, tab: tab)
    }

    func updateUIViewController(_ controller: WebController, context: Context) {
        if let request = model.openPath, request.tab == tab {
            controller.open(path: request.path)
            DispatchQueue.main.async { model.openPath = nil }
        }
    }
}
