import XCTest
@testable import Sift

// MARK: - TestSpotifyErrors

final class TestSpotifyErrors: XCTestCase {
    func testNotAuthenticatedHasDescription() {
        let error = SpotifyError.notAuthenticated
        XCTAssertNotNil(error.errorDescription)
        XCTAssertFalse((error.errorDescription ?? "").isEmpty)
    }

    func testForbiddenHasDescription() {
        let error = SpotifyError.forbidden
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue((error.errorDescription ?? "").contains("denied"))
    }

    func testApiErrorIncludesCode() {
        let error = SpotifyError.apiError(401, "Unauthorized")
        XCTAssertTrue((error.errorDescription ?? "").contains("401"))
    }
}

// MARK: - TestSpotifyAuthErrors

final class TestSpotifyAuthErrors: XCTestCase {
    func testAuthFailedIncludesReason() {
        let error = SpotifyAuthError.authFailed("user cancelled")
        XCTAssertTrue((error.errorDescription ?? "").contains("user cancelled"))
    }

    func testNotAuthenticatedHasDescription() {
        let error = SpotifyAuthError.notAuthenticated
        XCTAssertNotNil(error.errorDescription)
        XCTAssertFalse((error.errorDescription ?? "").isEmpty)
    }

    func testSpotifyAppNotInstalledHasDescription() {
        let error = SpotifyAuthError.spotifyAppNotInstalled
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue((error.errorDescription ?? "").contains("Spotify app"))
    }
}
