import Contacts
import ContactsUI
import PassKit
import UIKit
import WebKit

/// Shows the MK Cards site full-screen and adds what a web page cannot do on its own:
/// the share sheet, saving a contact, saving QR files, and adding passes to Apple Wallet.
/// The page reaches these through the `MKNative` object injected below.
final class WebViewController: UIViewController {
    private let site: URL = {
        let value = Bundle.main.object(forInfoDictionaryKey: "MKSiteURL") as? String ?? "https://mkcards.pages.dev"
        return URL(string: value) ?? URL(string: "https://mkcards.pages.dev")!
    }()
    private var webView: WKWebView!
    private var failedURL: URL?

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // keeps the login cookie between launches
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "MKCardsiOS/\(Self.appVersion)"

        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(MessageProxy(self), name: "mk")
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never // the page handles the notch itself
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: site))
    }

    func open(_ url: URL) {
        guard url.host == site.host else { return }
        webView.load(URLRequest(url: url))
    }

    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    // The same calls the Android app offers, so the site works the same in both.
    private static var bridgeScript: String {
        """
        (function () {
          const post = (type, data) => window.webkit.messageHandlers.mk.postMessage(Object.assign({ type }, data || {}));
          window.MKNative = {
            ready: () => post('ready'),
            appVersion: () => '\(appVersion)',
            share: (title, text, url) => post('share', { title, text, url }),
            saveContact: (vcard, filename) => post('saveContact', { vcard, filename }),
            saveFile: (base64, filename, mime) => post('saveFile', { base64, filename, mime }),
            addPass: (url) => post('addPass', { url }),
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
                let name = (body["filename"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "mkcards-qr.png"
                let file = FileManager.default.temporaryDirectory.appendingPathComponent(name.replacingOccurrences(of: "/", with: "_"))
                try? data.write(to: file)
                // "Save Image" puts a PNG in Photos; "Save to Files" keeps any file.
                var item: Any = file
                if (body["mime"] as? String) == "image/png", let image = UIImage(data: data) { item = image }
                present(activitySheet([item]), animated: true)
            }
        case "addPass":
            if let link = body["url"] as? String, let url = URL(string: link) { addPass(from: url) }
        case "checkForUpdate":
            // Sideloaded copies are updated by installing a newer build; the site itself is always current.
            webView.evaluateJavaScript("window.MKCards && window.MKCards.nativeUpdate('current')")
        case "retry":
            webView.load(URLRequest(url: failedURL ?? site))
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

    /// Shows the contact with the system's own "Create New Contact" / "Add to Existing Contact" options.
    private func showContact(_ vcard: String) {
        guard let data = vcard.data(using: .utf8),
              let contact = try? CNContactVCardSerialization.contacts(with: data).first else {
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

    /// Downloads a pass with the login cookie and offers it to Wallet, without leaving the app.
    private func addPass(from url: URL) {
        guard PKAddPassesViewController.canAddPasses() else {
            alert("This device cannot add passes to Apple Wallet.")
            return
        }
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            var request = URLRequest(url: url)
            let header = HTTPCookie.requestHeaderFields(with: cookies.filter { url.host?.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) ?? false })
            header.forEach { request.setValue($1, forHTTPHeaderField: $0) }
            URLSession.shared.dataTask(with: request) { data, response, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard let data, (response as? HTTPURLResponse)?.statusCode == 200, let pass = try? PKPass(data: data),
                          let sheet = PKAddPassesViewController(pass: pass) else {
                        self.alert("The pass could not be added. Please try again.")
                        return
                    }
                    self.present(sheet, animated: true)
                }
            }.resume()
        }
    }

    private func alert(_ message: String) {
        let box = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        box.addAction(UIAlertAction(title: "OK", style: .default))
        present(box, animated: true)
    }
}

extension WebViewController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.scheme == "file" || url.scheme == "about" || url.host == site.host {
            return decisionHandler(.allow)
        }
        // Phone calls, email, WhatsApp, Google Wallet and other sites open in their own apps.
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.response.mimeType == "application/vnd.apple.pkpass", let url = response.response.url {
            decisionHandler(.cancel)
            addPass(from: url)
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
        failedURL = webView.url ?? site
        webView.loadFileURL(page, allowingReadAccessTo: page)
    }

    // Links that ask for a new window (target=_blank) open in their own app.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host == site.host { webView.load(action.request) } else { UIApplication.shared.open(url) }
        }
        return nil
    }
}

/// Holds the page's message handler weakly, so the web view does not keep its controller alive forever.
private final class MessageProxy: NSObject, WKScriptMessageHandler {
    private weak var owner: WebViewController?
    init(_ owner: WebViewController) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any] { owner?.handle(body) }
    }
}
