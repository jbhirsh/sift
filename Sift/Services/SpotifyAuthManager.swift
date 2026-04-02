import AuthenticationServices
import CryptoKit
import Foundation

// MARK: - SpotifyAuthError

enum SpotifyAuthError: Error, LocalizedError {
    case authFailed(String)
    case notAuthenticated
    case spotifyAppNotInstalled
    case tokenExchangeFailed(Int)

    var errorDescription: String? {
        switch self {
        case .authFailed(let reason):
            return "Spotify login failed: \(reason)"
        case .notAuthenticated:
            return "Not logged in to Spotify. Please log in first."
        case .spotifyAppNotInstalled:
            return "The Spotify app is not installed."
        case .tokenExchangeFailed(let code):
            return "Spotify token exchange failed (HTTP \(code))."
        }
    }
}

// MARK: - SpotifyAuthManager

final class SpotifyAuthManager: NSObject, Sendable {
    static let shared = SpotifyAuthManager()

    static let tokenKey = "spotify_access_token"
    private static let expirationKey = "spotify_token_expiration"
    private static let refreshTokenKey = "spotify_refresh_token"

    static let redirectURI = "sift-music://spotify-callback"

    // MARK: - Client ID

    static let clientID: String = {
        guard let id = Bundle.main.object(forInfoDictionaryKey: "SpotifyClientID") as? String,
              !id.isEmpty else {
            fatalError("SpotifyClientID missing from Info.plist")
        }
        return id
    }()

    static let scopes = "user-library-read playlist-modify-public playlist-modify-private"

    // MARK: - Token state

    var accessToken: String? {
        UserDefaults.standard.string(forKey: Self.tokenKey)
    }

    var refreshToken: String? {
        UserDefaults.standard.string(forKey: Self.refreshTokenKey)
    }

    var isAuthenticated: Bool {
        guard accessToken != nil else { return false }
        let expiration = UserDefaults.standard.double(forKey: Self.expirationKey)
        return Date().timeIntervalSince1970 < expiration
    }

    // MARK: - PKCE Helpers

    static func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 64)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }

    static func generateCodeChallenge(from verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncoded()
    }

    // MARK: - Authorization (PKCE via ASWebAuthenticationSession)

    @MainActor
    func authorize() async throws {
        let codeVerifier = Self.generateCodeVerifier()
        let codeChallenge = Self.generateCodeChallenge(from: codeVerifier)

        // swiftlint:disable:next force_unwrapping
        var components = URLComponents(string: "https://accounts.spotify.com/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: Self.clientID),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: Self.redirectURI),
            URLQueryItem(name: "scope", value: Self.scopes),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "code_challenge", value: codeChallenge)
        ]

        let authURL = components.url!  // swiftlint:disable:this force_unwrapping

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "sift-music"
            ) { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else {
                    let reason = error?.localizedDescription ?? "User cancelled"
                    continuation.resume(throwing: SpotifyAuthError.authFailed(reason))
                }
            }
            let anchor = WebAuthPresentationAnchor()
            session.presentationContextProvider = anchor
            session.prefersEphemeralWebBrowserSession = true
            session.start()
        }

        guard let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "code" })?.value else {
            if let error = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "error" })?.value {
                throw SpotifyAuthError.authFailed(error)
            }
            throw SpotifyAuthError.authFailed("No authorization code in callback")
        }

        try await exchangeCodeForTokens(code: code, codeVerifier: codeVerifier)
    }

    // MARK: - Token Exchange

    private func exchangeCodeForTokens(code: String, codeVerifier: String) async throws {
        let url = URL(string: "https://accounts.spotify.com/api/token")!  // swiftlint:disable:this force_unwrapping
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type=authorization_code",
            "code=\(code)",
            "redirect_uri=\(Self.redirectURI)",
            "client_id=\(Self.clientID)",
            "code_verifier=\(codeVerifier)"
        ].joined(separator: "&")
        request.httpBody = Data(body.utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw SpotifyAuthError.tokenExchangeFailed(code)
        }

        try storeTokenResponse(data)
    }

    // MARK: - Token Refresh

    func refreshTokenIfNeeded() async throws {
        guard !isAuthenticated else { return }

        guard let refresh = refreshToken else {
            throw SpotifyAuthError.notAuthenticated
        }

        let url = URL(string: "https://accounts.spotify.com/api/token")!  // swiftlint:disable:this force_unwrapping
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type=refresh_token",
            "refresh_token=\(refresh)",
            "client_id=\(Self.clientID)"
        ].joined(separator: "&")
        request.httpBody = Data(body.utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            // Refresh token may be revoked — fall back to full re-authorization
            try await authorize()
            return
        }

        try storeTokenResponse(data)
    }

    // MARK: - Token Storage

    private func storeTokenResponse(_ data: Data) throws {
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let accessToken = json?["access_token"] as? String,
              let expiresIn = json?["expires_in"] as? Int else {
            throw SpotifyAuthError.authFailed("Invalid token response")
        }

        UserDefaults.standard.set(accessToken, forKey: Self.tokenKey)
        UserDefaults.standard.set(
            Date().timeIntervalSince1970 + Double(expiresIn) - 60,
            forKey: Self.expirationKey
        )

        if let newRefresh = json?["refresh_token"] as? String {
            UserDefaults.standard.set(newRefresh, forKey: Self.refreshTokenKey)
        }
    }

    // MARK: - Logout

    func logout() {
        UserDefaults.standard.removeObject(forKey: Self.tokenKey)
        UserDefaults.standard.removeObject(forKey: Self.expirationKey)
        UserDefaults.standard.removeObject(forKey: Self.refreshTokenKey)
    }
}

// MARK: - Base64URL Encoding

extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

// MARK: - Presentation Anchor

@MainActor
private final class WebAuthPresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
