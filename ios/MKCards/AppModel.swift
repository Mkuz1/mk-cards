import AuthenticationServices
import CryptoKit
import SwiftUI
import WebKit

/// What the server says about the person signed in (GET /api/me).
struct Me: Decodable {
    struct Org: Decodable {
        let name: String
        let role: String?
        var isAdmin: Bool { role == "admin" || role == "owner" }
    }
    struct Identity: Decodable, Hashable {
        let provider: String
        let email: String?
    }
    struct User: Decodable {
        let username: String
        let email: String
        let hasPassword: Bool?
        let identities: [Identity]?
        let org: Org?
    }
    struct Card: Decodable {
        let name: String
        let title: String?
        let company: String?
        let label: String?
        let accent: String?
        let department: String?
    }
    struct Entry: Decodable, Identifiable {
        let id: String
        let slug: String
        let card: Card
        let active: Bool?
        let views: Int?
        let saves: Int?
        let contacts: Int?

        var displayName: String {
            if let label = card.label, !label.isEmpty { return label }
            return slug.isEmpty ? "Main card" : slug.capitalized
        }
        var role: String { [card.title, card.company].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") }
        var isActive: Bool { active ?? true }
    }
    struct Wallet: Decodable {
        let apple: Bool?
        let google: Bool?
    }
    struct SSO: Decodable {
        let google: Bool?
        let microsoft: Bool?
    }
    let user: User?
    let cards: [Entry]
    let wallet: Wallet?
    let sso: SSO?
}

/// A person the user met: shared on a card page, scanned, or typed in.
struct Contact: Decodable, Identifiable, Hashable {
    struct CRM: Decodable, Hashable { let id: String }
    let id: Int
    let name: String
    let title: String?
    let company: String?
    let email: String?
    let phone: String?
    let mobile: String?
    let website: String?
    let address: String?
    let note: String?
    let event: String?
    let source: String?
    let createdAt: Double
    let crm: CRM?
    let crmError: String?

    var role: String { [title, company].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") }
    var date: Date { Date(timeIntervalSince1970: createdAt / 1000) }
    var sourceLabel: String {
        switch source {
        case "scan": return "Scanned card"
        case "badge": return "Scanned badge"
        case "manual": return "Added by hand"
        default: return "Shared on your card"
        }
    }
}

struct CRMState: Decodable {
    let connected: Bool
    let canManage: Bool
    let mkApp: Bool?
    let userName: String?
    let scope: String?
}

struct CardStats: Decodable {
    struct Day: Decodable, Identifiable {
        let day: String
        let view: Int
        let save: Int
        var id: String { day }
    }
    let total: [String: Int]
    let series: [Day]
}

enum Tab: Hashable {
    case cards, share, scan, contacts, account

    var path: String {
        switch self {
        case .cards: return "/"
        case .share: return "/"
        case .scan: return "/scan"
        case .contacts: return "/contacts"
        case .account: return "/account"
        }
    }
}

struct PageRequest: Equatable {
    let id = UUID()
    let tab: Tab
    let path: String
}

enum AppError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self {
        case .message(let text): return text
        }
    }
}

/// The app's state: whether someone is signed in, their cards, and the calls to the MK Cards server.
/// The sign-in cookie lives in the web views' cookie store, so native screens and web pages share one session.
@MainActor
final class AppModel: ObservableObject {
    enum Phase { case loading, signedOut, signedIn }

    @Published var phase: Phase = .loading
    @Published var me: Me?
    @Published var sso = Me.SSO(google: false, microsoft: false)
    @Published var alert: String?
    @Published var tab: Tab = .cards
    @Published var busy = false
    /// A page a web tab should open next (for example /new after creating an account).
    @Published var openPath: PageRequest?
    /// The card shown on the Share tab.
    @Published var shareCardId: String?

    let site: URL = {
        let value = Bundle.main.object(forInfoDictionaryKey: "MKSiteURL") as? String ?? "https://mkcards.pages.dev"
        return URL(string: value) ?? URL(string: "https://mkcards.pages.dev")!
    }()

    private var authSession: ASWebAuthenticationSession?
    private var appleNonce = ""

    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "2.0"
    }

    func url(_ path: String) -> URL {
        URL(string: path, relativeTo: site)?.absoluteURL ?? site
    }

    func cardURL(_ entry: Me.Entry) -> URL {
        url("/\(me?.user?.username ?? "")\(entry.slug.isEmpty ? "" : "/" + entry.slug)")
    }

    // MARK: - Server calls

    private var cookieStore: WKHTTPCookieStore { WKWebsiteDataStore.default().httpCookieStore }

    private func siteCookies() async -> [HTTPCookie] {
        let host = site.host ?? ""
        return await cookieStore.allCookies().filter { host.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
    }

    @discardableResult
    func send(_ path: String, method: String = "GET", json: [String: Any]? = nil) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url(path))
        request.httpMethod = method
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        HTTPCookie.requestHeaderFields(with: await siteCookies()).forEach { request.setValue($1, forHTTPHeaderField: $0) }
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await NoRedirects.session.data(for: request)
        } catch {
            throw AppError.message("No connection. Check your internet and try again.")
        }
        guard let http = response as? HTTPURLResponse else { throw AppError.message("No connection.") }
        if let fields = http.allHeaderFields as? [String: String], let address = request.url {
            for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: address) {
                if let expires = cookie.expiresDate, expires < Date() {
                    await cookieStore.deleteCookie(cookie)
                } else {
                    await cookieStore.setCookie(cookie)
                }
            }
        }
        return (data, http)
    }

    private func check(_ data: Data, _ http: HTTPURLResponse) throws {
        guard (200..<300).contains(http.statusCode) else {
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw AppError.message(object?["error"] as? String ?? "Something went wrong. Please try again.")
        }
    }

    func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        let (data, http) = try await send(path)
        try check(data, http)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Sends a change and returns the reply as JSON (an empty object when there is none).
    @discardableResult
    func change(_ path: String, method: String = "POST", json: [String: Any] = [:]) async throws -> [String: Any] {
        let (data, http) = try await send(path, method: method, json: json)
        try check(data, http)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    /// Connects Microsoft or Google to this account, through Apple's secure browser sheet.
    func connectIdentity(_ provider: String) async {
        do {
            let reply = try await change("/api/auth/ticket", json: ["mode": "link"])
            guard let ticket = reply["ticket"] as? String else { return }
            let start = url("/api/auth/sso/\(provider)/start?mode=link&ticket=\(ticket.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")
            _ = await companySignIn(start: start)
            await refresh()
        } catch {
            alert = error.localizedDescription
        }
    }

    func refresh() async {
        do {
            let (data, http) = try await send("/api/me")
            try check(data, http)
            let value = try JSONDecoder().decode(Me.self, from: data)
            me = value
            if let s = value.sso { sso = s }
            phase = value.user == nil ? .signedOut : .signedIn
        } catch {
            // Offline: keep someone who has a session signed in; the pages show their own offline screen.
            if phase == .loading {
                let signedIn = await siteCookies().contains { $0.name == "mk_session" }
                phase = signedIn ? .signedIn : .signedOut
            }
        }
    }

    func logIn(login: String, password: String) async throws {
        let (data, http) = try await send("/api/auth/login", method: "POST", json: ["login": login, "password": password])
        try check(data, http)
        await refresh()
        tab = .cards
    }

    func register(username: String, email: String, password: String) async throws {
        let (data, http) = try await send("/api/auth/register", method: "POST", json: ["username": username, "email": email, "password": password])
        try check(data, http)
        await refresh()
        tab = .cards
        openPath = PageRequest(tab: .cards, path: "/new")
    }

    /// Finishes a sign-in made in the system browser or with Apple: swaps the one-time code for a session.
    func handoff(code: String, next: String) async throws {
        let safeNext = next.hasPrefix("/") && !next.hasPrefix("//") ? next : "/"
        let query = "code=\(code.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&next=\(safeNext.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "/")"
        let (_, http) = try await send("/api/auth/handoff?\(query)")
        let location = http.value(forHTTPHeaderField: "Location") ?? ""
        if location.contains("/login") { throw AppError.message("That sign-in has expired. Please try again.") }
        await refresh()
        tab = .cards
        if safeNext != "/" { openPath = PageRequest(tab: .cards, path: safeNext) }
    }

    func signOut() async {
        _ = try? await send("/api/auth/logout", method: "POST")
        await forgetSession()
    }

    /// The page signed out (Log out, account deleted, or the session ended).
    func forgetSession() async {
        for cookie in await siteCookies() where cookie.name == "mk_session" { await cookieStore.deleteCookie(cookie) }
        me = nil
        phase = .signedOut
        tab = .cards
        await refresh()
    }

    // MARK: - Microsoft and Google (system browser sheet)

    /// Runs a sign-in page in Apple's secure browser sheet and returns the mkcards:// address it ends on.
    func webAuthentication(_ start: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: start, callbackURLScheme: "mkcards") { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else {
                    continuation.resume(throwing: AppError.message("The sign-in could not be completed."))
                }
            }
            session.presentationContextProvider = AuthAnchor.shared
            session.prefersEphemeralWebBrowserSession = false
            authSession = session
            session.start()
        }
    }

    /// Signs in with Microsoft or Google, or (with a ticket) connects one to an account or company.
    /// Returns the page to show afterwards.
    @discardableResult
    func companySignIn(start: URL) async -> String? {
        var parts = URLComponents(url: start, resolvingAgainstBaseURL: false)
        var items = parts?.queryItems ?? []
        items.removeAll { $0.name == "app" }
        items.append(URLQueryItem(name: "app", value: "ios"))
        parts?.queryItems = items
        guard let address = parts?.url else { return nil }
        do {
            let callback = try await webAuthentication(address)
            let q = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let value = { (name: String) in q.first { $0.name == name }?.value }
            let next = value("next") ?? "/"
            if let error = value("error") {
                alert = error
                return nil
            }
            if let code = value("code") {
                try await handoff(code: code, next: next)
                return nil
            }
            return next
        } catch is CancellationError {
            return nil
        } catch {
            alert = error.localizedDescription
            return nil
        }
    }

    func signIn(with provider: String) {
        Task { await companySignIn(start: url("/api/auth/sso/\(provider)/start")) }
    }

    // MARK: - Sign in with Apple

    func prepareApple(_ request: ASAuthorizationAppleIDRequest) {
        let bytes = (0..<32).map { _ in UInt8.random(in: 0...255) }
        appleNonce = Data(bytes).base64EncodedString()
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(appleNonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func finishApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled {
                alert = "Sign in with Apple did not finish. Please try again."
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
                alert = "Sign in with Apple did not finish. Please try again."
                return
            }
            let name = [credential.fullName?.givenName, credential.fullName?.familyName].compactMap { $0 }.joined(separator: " ")
            Task {
                busy = true
                defer { busy = false }
                do {
                    let (data, http) = try await send("/api/auth/apple", method: "POST", json: ["identityToken": token, "nonce": appleNonce, "name": name])
                    try check(data, http)
                    let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                    guard let code = object?["handoff"] as? String else { throw AppError.message("Sign in with Apple did not finish.") }
                    try await handoff(code: code, next: object?["next"] as? String ?? "/")
                } catch {
                    alert = error.localizedDescription
                }
            }
        }
    }
}

/// Lets a call see the server's redirect (and its cookie) instead of following it.
final class NoRedirects: NSObject, URLSessionTaskDelegate {
    static let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

final class AuthAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AuthAnchor()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.keyWindow ?? ASPresentationAnchor()
    }
}

extension UIApplication {
    var keyWindow: UIWindow? {
        connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
    }

    /// The screen on top, for presenting system sheets.
    var topController: UIViewController? {
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
