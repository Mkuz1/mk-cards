import Contacts
import ContactsUI
import PassKit
import UIKit
import WebKit

/// Shows one page of the MK Cards site and adds what a web page cannot do by itself: the camera scanner,
/// saving contacts and files, Apple Wallet, haptics and company sign-in in Apple's secure browser sheet.
/// Pages reach these through `window.MKNative`, the same calls the Android app offers.
final class WebController: UIViewController {
    private let model: AppModel
    private let tab: Tab
    private var webView: WKWebView!
    private var failedURL: URL?
    private var site: URL { model.site }

    init(model: AppModel, tab: Tab) {
        self.model = model
        self.tab = tab
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // one sign-in shared by every tab and the native screens
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "MKCardsiOS/\(AppModel.appVersion)"
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(MessageProxy(self), name: "mk")
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.933, green: 0.945, blue: 0.965, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        let refresh = UIRefreshControl()
        refresh.addAction(UIAction { [weak self] _ in
            self?.webView.reload()
            refresh.endRefreshing()
        }, for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        if #available(iOS 16.4, *) { webView.isInspectable = false }
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        open(path: tab.path)
    }

    func open(path: String) {
        webView.load(URLRequest(url: model.url(path)))
    }

    private static var bridgeScript: String {
        """
        (function () {
          const post = (type, data) => window.webkit.messageHandlers.mk.postMessage(Object.assign({ type }, data || {}));
          window.MKNative = {
            hasTabBar: true,
            ready: () => post('ready'),
            appVersion: () => '\(AppModel.appVersion)',
            share: (title, text, url) => post('share', { title, text, url }),
            saveContact: (vcard, filename) => post('saveContact', { vcard, filename }),
            saveFile: (base64, filename, mime) => post('saveFile', { base64, filename, mime }),
            addPass: (url) => post('addPass', { url }),
            scanCard: (kind) => post('scanCard', { kind }),
            haptic: (kind) => post('haptic', { kind }),
            signedOut: () => post('signedOut'),
            checkForUpdate: () => post('checkForUpdate'),
          };
        })();
        """
    }

    fileprivate func handle(_ body: [String: Any]) {
        switch body["type"] as? String {
        case "share":
            let items: [Any] = [[body["text"] as? String, body["url"] as? String].compactMap { $0 }.joined(separator: "\n")]
            present(activitySheet(items), animated: true)
        case "saveContact":
            if let vcard = body["vcard"] as? String { showContact(vcard) }
        case "saveFile":
            if let base64 = body["base64"] as? String, let data = Data(base64Encoded: base64) {
                let name = (body["filename"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "mkcards-file"
                let file = FileManager.default.temporaryDirectory.appendingPathComponent(name.replacingOccurrences(of: "/", with: "_"))
                try? data.write(to: file)
                // "Save Image" puts pictures in Photos; "Save to Files" keeps any file.
                var item: Any = file
                if let mime = body["mime"] as? String, mime.hasPrefix("image/"), mime != "image/svg+xml", let image = UIImage(data: data) { item = image }
                present(activitySheet([item]), animated: true)
            }
        case "addPass":
            if let link = body["url"] as? String, let url = URL(string: link) { Wallet.addPass(from: url, presenter: self) }
        case "scanCard":
            CardScanner.shared.scan(kind: body["kind"] as? String ?? "card", from: self) { [weak self] result in
                guard let self, let result else { return }
                let payload: [String: String] = ["image": result.image, "text": result.text, "qr": result.qr]
                guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
                self.webView.evaluateJavaScript("window.MKCards && window.MKCards.scanned(\(json))")
            }
        case "haptic":
            UINotificationFeedbackGenerator().notificationOccurred(body["kind"] as? String == "error" ? .error : .success)
        case "signedOut":
            Task { await model.forgetSession() }
        case "checkForUpdate":
            // App Store updates arrive by themselves; the pages are always current.
            webView.evaluateJavaScript("window.MKCards && window.MKCards.nativeUpdate('current')")
        case "retry":
            webView.load(URLRequest(url: failedURL ?? model.url(tab.path)))
        default:
            break
        }
    }

    private func activitySheet(_ items: [Any]) -> UIActivityViewController {
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1)
        return sheet
    }

    /// The system's own "Create New Contact" / "Add to Existing Contact" card.
    private func showContact(_ vcard: String) {
        guard let data = vcard.data(using: .utf8), let contact = try? CNContactVCardSerialization.contacts(with: data).first else {
            alert("This contact could not be opened.")
            return
        }
        let card = CNContactViewController(forUnknownContact: contact)
        card.contactStore = CNContactStore()
        card.allowsActions = true
        card.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        present(UINavigationController(rootViewController: card), animated: true)
    }

    private func alert(_ message: String) {
        let box = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        box.addAction(UIAlertAction(title: "OK", style: .default))
        present(box, animated: true)
    }

    /// Salesforce's sign-in pages stay inside the app so the connection can finish here.
    private func isSalesforce(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return ["salesforce.com", "force.com", "cloudforce.com", "salesforce-setup.com"].contains { host == $0 || host.hasSuffix("." + $0) }
    }
}

extension WebController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.host == site.host {
            // Microsoft and Google refuse sign-in inside an app's web view: use Apple's secure browser sheet.
            if url.path.hasPrefix("/api/auth/sso/") {
                decisionHandler(.cancel)
                Task { @MainActor in
                    if let next = await model.companySignIn(start: url) { open(path: next) }
                }
                return
            }
            return decisionHandler(.allow)
        }
        if url.scheme == "file" || url.scheme == "about" || isSalesforce(url) { return decisionHandler(.allow) }
        // Phone calls, email, WhatsApp, Google Wallet and other sites open in their own apps.
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.response.mimeType == "application/vnd.apple.pkpass", let url = response.response.url {
            decisionHandler(.cancel)
            Wallet.addPass(from: url, presenter: self)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOffline(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showOffline(error)
    }

    private func showOffline(_ error: Error) {
        let code = (error as NSError).code
        guard code != NSURLErrorCancelled, let page = Bundle.main.url(forResource: "offline", withExtension: "html") else { return }
        failedURL = webView.url ?? model.url(tab.path)
        webView.loadFileURL(page, allowingReadAccessTo: page)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host == site.host { webView.load(action.request) } else { UIApplication.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let box = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        box.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        box.addAction(UIAlertAction(title: "OK", style: .destructive) { _ in completionHandler(true) })
        present(box, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let box = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        box.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(box, animated: true)
    }
}

/// Holds the page's message handler weakly, so the web view does not keep its controller alive forever.
private final class MessageProxy: NSObject, WKScriptMessageHandler {
    private weak var owner: WebController?
    init(_ owner: WebController) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any] { owner?.handle(body) }
    }
}
