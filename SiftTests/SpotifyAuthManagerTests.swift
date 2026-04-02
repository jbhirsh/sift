import XCTest
@testable import Sift

// MARK: - TestSpotifyAuthManagerTokenState

final class TestSpotifyAuthManagerTokenState: XCTestCase {
    private let tokenKey = "spotify_access_token"
    private let expirationKey = "spotify_token_expiration"
    private let refreshTokenKey = "spotify_refresh_token"

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: expirationKey)
        UserDefaults.standard.removeObject(forKey: refreshTokenKey)
        super.tearDown()
    }

    func testIsAuthenticatedFalseWhenNoToken() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        XCTAssertFalse(SpotifyAuthManager.shared.isAuthenticated)
    }

    func testIsAuthenticatedFalseWhenExpired() {
        UserDefaults.standard.set("test-token", forKey: tokenKey)
        UserDefaults.standard.set(
            Date().timeIntervalSince1970 - 3600,
            forKey: expirationKey
        )
        XCTAssertFalse(SpotifyAuthManager.shared.isAuthenticated)
    }

    func testIsAuthenticatedTrueWhenValidToken() {
        UserDefaults.standard.set("test-token", forKey: tokenKey)
        UserDefaults.standard.set(
            Date().timeIntervalSince1970 + 3600,
            forKey: expirationKey
        )
        XCTAssertTrue(SpotifyAuthManager.shared.isAuthenticated)
    }

    func testAccessTokenReadsFromUserDefaults() {
        UserDefaults.standard.set("my-token", forKey: tokenKey)
        XCTAssertEqual(SpotifyAuthManager.shared.accessToken, "my-token")
    }

    func testAccessTokenNilWhenNotSet() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        XCTAssertNil(SpotifyAuthManager.shared.accessToken)
    }

    func testRefreshTokenReadsFromUserDefaults() {
        UserDefaults.standard.set("my-refresh", forKey: refreshTokenKey)
        XCTAssertEqual(SpotifyAuthManager.shared.refreshToken, "my-refresh")
    }

    func testRefreshTokenNilWhenNotSet() {
        UserDefaults.standard.removeObject(forKey: refreshTokenKey)
        XCTAssertNil(SpotifyAuthManager.shared.refreshToken)
    }

    func testLogoutClearsAllTokenData() {
        UserDefaults.standard.set("token", forKey: tokenKey)
        UserDefaults.standard.set(999.0, forKey: expirationKey)
        UserDefaults.standard.set("refresh", forKey: refreshTokenKey)

        SpotifyAuthManager.shared.logout()

        XCTAssertNil(UserDefaults.standard.string(forKey: tokenKey))
        XCTAssertEqual(UserDefaults.standard.double(forKey: expirationKey), 0)
        XCTAssertNil(UserDefaults.standard.string(forKey: refreshTokenKey))
    }

    func testClientIDIsNonEmpty() {
        XCTAssertFalse(SpotifyAuthManager.clientID.isEmpty)
    }
}

// MARK: - TestSpotifyAuthManagerPKCE

final class TestSpotifyAuthManagerPKCE: XCTestCase {
    func testCodeVerifierIsCorrectLength() {
        let verifier = SpotifyAuthManager.generateCodeVerifier()
        // 64 random bytes base64url-encoded → 86 characters (no padding)
        XCTAssertEqual(verifier.count, 86)
    }

    func testCodeVerifierIsBase64URLSafe() {
        let verifier = SpotifyAuthManager.generateCodeVerifier()
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        XCTAssertTrue(verifier.unicodeScalars.allSatisfy { allowed.contains($0) })
    }

    func testCodeVerifierIsUnique() {
        let first = SpotifyAuthManager.generateCodeVerifier()
        let second = SpotifyAuthManager.generateCodeVerifier()
        XCTAssertNotEqual(first, second)
    }

    func testCodeChallengeIsDeterministic() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let challenge1 = SpotifyAuthManager.generateCodeChallenge(from: verifier)
        let challenge2 = SpotifyAuthManager.generateCodeChallenge(from: verifier)
        XCTAssertEqual(challenge1, challenge2)
    }

    func testCodeChallengeIsBase64URLSafe() {
        let verifier = SpotifyAuthManager.generateCodeVerifier()
        let challenge = SpotifyAuthManager.generateCodeChallenge(from: verifier)
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        XCTAssertTrue(challenge.unicodeScalars.allSatisfy { allowed.contains($0) })
    }

    func testCodeChallengeDiffersFromVerifier() {
        let verifier = SpotifyAuthManager.generateCodeVerifier()
        let challenge = SpotifyAuthManager.generateCodeChallenge(from: verifier)
        XCTAssertNotEqual(verifier, challenge)
    }
}

// MARK: - TestSpotifyAuthManagerRefresh

final class TestSpotifyAuthManagerRefresh: XCTestCase {
    private let tokenKey = "spotify_access_token"
    private let expirationKey = "spotify_token_expiration"

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: expirationKey)
        super.tearDown()
    }

    func testRefreshTokenIfNeededReturnsEarlyWhenAuthenticated() async throws {
        UserDefaults.standard.set("valid-token", forKey: tokenKey)
        UserDefaults.standard.set(
            Date().timeIntervalSince1970 + 3600,
            forKey: expirationKey
        )

        // Should return without throwing — token is still valid
        try await SpotifyAuthManager.shared.refreshTokenIfNeeded()
        XCTAssertTrue(SpotifyAuthManager.shared.isAuthenticated)
    }
}

// MARK: - TestBase64URLEncoding

final class TestBase64URLEncoding: XCTestCase {
    func testBase64URLEncodingRemovesPadding() {
        let data = Data([0xFF])  // base64 = "/w==" → base64url = "_w"
        let encoded = data.base64URLEncoded()
        XCTAssertFalse(encoded.contains("="))
    }

    func testBase64URLEncodingReplacesUnsafeCharacters() {
        // Data that produces + and / in standard base64
        let data = Data([0xFB, 0xFF, 0xFE])  // base64 = "u//+" → base64url = "u__-"
        let encoded = data.base64URLEncoded()
        XCTAssertFalse(encoded.contains("+"))
        XCTAssertFalse(encoded.contains("/"))
    }

    func testBase64URLEncodingRoundTrip() {
        let original = "hello world"
        let data = Data(original.utf8)
        let encoded = data.base64URLEncoded()
        // Reverse: restore standard base64 and decode
        var base64 = encoded
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        let decoded = Data(base64Encoded: base64)
        XCTAssertEqual(decoded, data)
    }
}
