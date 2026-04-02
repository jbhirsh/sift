import XCTest
@testable import Sift

// MARK: - TestSpotifyServiceLoadLibrary

final class TestSpotifyServiceLoadLibrary: XCTestCase {
    private let tokenKey = "spotify_access_token"
    private let expirationKey = "spotify_token_expiration"
    private let refreshKey = "spotify_refresh_token"

    private final class StubURLProtocol: URLProtocol {
        nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

        override static func canInit(with request: URLRequest) -> Bool { true }
        override static func canonicalRequest(for request: URLRequest) -> URLRequest { request }

        override func startLoading() {
            guard let handler = Self.requestHandler else {
                client?.urlProtocolDidFinishLoading(self)
                return
            }
            do {
                let (response, data) = try handler(request)
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: data)
                client?.urlProtocolDidFinishLoading(self)
            } catch {
                client?.urlProtocol(self, didFailWithError: error)
            }
        }

        override func stopLoading() {}
    }

    override func setUp() {
        super.setUp()
        URLProtocol.registerClass(StubURLProtocol.self)
        UserDefaults.standard.set("test-token", forKey: tokenKey)
        UserDefaults.standard.set(
            Date().timeIntervalSince1970 + 3600,
            forKey: expirationKey
        )
    }

    override func tearDown() {
        URLProtocol.unregisterClass(StubURLProtocol.self)
        StubURLProtocol.requestHandler = nil
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: expirationKey)
        UserDefaults.standard.removeObject(forKey: refreshKey)
        super.tearDown()
    }

    private func stubSingleResponse(json: String) {
        StubURLProtocol.requestHandler = { request in
            guard let url = request.url else { throw SpotifyError.apiError(0, "No URL") }
            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data(json.utf8))
        }
    }

    private func stubErrorResponse(statusCode: Int) {
        StubURLProtocol.requestHandler = { request in
            guard let url = request.url else { throw SpotifyError.apiError(0, "No URL") }
            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: statusCode, httpVersion: nil, headerFields: nil)!
            return (response, Data("Error".utf8))
        }
    }

    func testLoadLibrarySinglePage() async throws {
        stubSingleResponse(json: """
        {
            "items": [{
                "added_at": "2024-01-15T12:00:00Z",
                "track": {
                    "id": "abc123", "name": "Test Song",
                    "artists": [{"name": "Test Artist"}],
                    "album": {"name": "Test Album",
                        "images": [{"url": "https://example.com/img.jpg", "width": 640, "height": 640}]},
                    "duration_ms": 210000,
                    "preview_url": "https://example.com/preview.mp3"
                }
            }],
            "next": null
        }
        """)

        let service = SpotifyService()
        let tracks = try await service.loadLibrary()
        XCTAssertEqual(tracks.count, 1)
        XCTAssertEqual(tracks[0].name, "Test Song")
        XCTAssertEqual(tracks[0].artist, "Test Artist")
        XCTAssertEqual(tracks[0].album, "Test Album")
        XCTAssertEqual(tracks[0].duration, 210.0)
        XCTAssertNotNil(tracks[0].artworkURL)
    }

    func testLoadLibraryPaginationFirstPage() async throws {
        var callCount = 0
        let page1 = """
        {"items": [{"added_at": "2024-01-15T12:00:00Z",
            "track": {"id": "t1", "name": "Song One", "artists": [{"name": "A"}],
                "album": {"name": "Al", "images": []}, "duration_ms": 180000, "preview_url": null}}],
         "next": "https://api.spotify.com/v1/me/tracks?offset=50"}
        """
        let page2 = """
        {"items": [{"added_at": "2024-02-20T08:30:00Z",
            "track": {"id": "t2", "name": "Song Two", "artists": [{"name": "B"}, {"name": "C"}],
                "album": {"name": "Al2", "images": []}, "duration_ms": 240000, "preview_url": null}}],
         "next": null}
        """
        StubURLProtocol.requestHandler = { request in
            callCount += 1
            guard let url = request.url else { throw SpotifyError.apiError(0, "No URL") }
            let json = callCount == 1 ? page1 : page2
            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data(json.utf8))
        }

        let service = SpotifyService()
        let tracks = try await service.loadLibrary()
        XCTAssertEqual(tracks.count, 2)
        XCTAssertEqual(tracks[0].name, "Song One")
        XCTAssertEqual(tracks[1].name, "Song Two")
        XCTAssertEqual(tracks[1].artist, "B, C")
        XCTAssertEqual(callCount, 2)
    }

    func testLoadLibraryThrowsOnApiError() async {
        stubErrorResponse(statusCode: 500)

        let service = SpotifyService()
        do {
            _ = try await service.loadLibrary()
            XCTFail("Expected SpotifyError to be thrown")
        } catch let error as SpotifyError {
            if case .apiError(let code, _) = error {
                XCTAssertEqual(code, 500)
            } else {
                XCTFail("Expected apiError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testLoadLibraryThrowsNotAuthenticatedOn401() async {
        stubErrorResponse(statusCode: 401)

        let service = SpotifyService()
        do {
            _ = try await service.loadLibrary()
            XCTFail("Expected SpotifyError to be thrown")
        } catch let error as SpotifyError {
            if case .notAuthenticated = error { /* expected */ } else {
                XCTFail("Expected notAuthenticated, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testLoadLibraryThrowsForbiddenOn403() async {
        stubErrorResponse(statusCode: 403)

        let service = SpotifyService()
        do {
            _ = try await service.loadLibrary()
            XCTFail("Expected SpotifyError to be thrown")
        } catch let error as SpotifyError {
            if case .forbidden = error { /* expected */ } else {
                XCTFail("Expected forbidden, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testLoadLibraryThrowsWhenNotAuthenticated() async {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: expirationKey)

        let service = SpotifyService()
        do {
            _ = try await service.loadLibrary()
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertTrue(error is SpotifyAuthError || error is SpotifyError)
        }
    }

    func testLoadLibraryMultipleArtistsJoinedByComma() async throws {
        stubSingleResponse(json: """
        {"items": [{"track": {"id": "c1", "name": "Collab",
            "artists": [{"name": "Alpha"}, {"name": "Beta"}, {"name": "Gamma"}],
            "album": {"name": "Collabs", "images": []},
            "duration_ms": 300000, "preview_url": null}}],
         "next": null}
        """)

        let service = SpotifyService()
        let tracks = try await service.loadLibrary()
        XCTAssertEqual(tracks[0].artist, "Alpha, Beta, Gamma")
    }

    func testLoadLibrarySelectsLargestArtwork() async throws {
        stubSingleResponse(json: """
        {"items": [{"track": {"id": "a1", "name": "Art",
            "artists": [{"name": "Painter"}],
            "album": {"name": "Gallery", "images": [
                {"url": "https://example.com/small.jpg", "width": 64, "height": 64},
                {"url": "https://example.com/large.jpg", "width": 640, "height": 640},
                {"url": "https://example.com/medium.jpg", "width": 300, "height": 300}]},
            "duration_ms": 120000, "preview_url": null}}],
         "next": null}
        """)

        let service = SpotifyService()
        let tracks = try await service.loadLibrary()
        XCTAssertEqual(tracks[0].artworkURL?.absoluteString, "https://example.com/large.jpg")
    }
}

// MARK: - TestSpotifyServicePlayback

final class TestSpotifyServicePlayback: XCTestCase {
    func testCurrentPositionReturnsZeroInitially() async {
        let service = SpotifyService()
        let position = await service.currentPosition()
        XCTAssertEqual(position, 0)
    }

    func testIsPlayingReturnsFalseInitially() async {
        let service = SpotifyService()
        let playing = await service.isPlaying()
        XCTAssertFalse(playing)
    }
}
