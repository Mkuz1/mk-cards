import PassKit
import UIKit
import WebKit

enum Wallet {
    /// Downloads a pass with the sign-in cookie and offers it to Apple Wallet, without leaving the app.
    static func addPass(from url: URL, presenter: UIViewController) {
        guard PKAddPassesViewController.canAddPasses() else {
            show("This device cannot add passes to Apple Wallet.", on: presenter)
            return
        }
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            var request = URLRequest(url: url)
            let mine = cookies.filter { url.host?.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) ?? false }
            HTTPCookie.requestHeaderFields(with: mine).forEach { request.setValue($1, forHTTPHeaderField: $0) }
            URLSession.shared.dataTask(with: request) { data, response, _ in
                DispatchQueue.main.async {
                    guard let data, (response as? HTTPURLResponse)?.statusCode == 200, let pass = try? PKPass(data: data),
                          let sheet = PKAddPassesViewController(pass: pass) else {
                        show("The pass could not be added. Please try again.", on: presenter)
                        return
                    }
                    presenter.present(sheet, animated: true)
                }
            }.resume()
        }
    }

    static func show(_ message: String, on presenter: UIViewController) {
        let box = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        box.addAction(UIAlertAction(title: "OK", style: .default))
        presenter.present(box, animated: true)
    }
}
