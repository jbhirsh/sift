import XCTest
@testable import Sift

// MARK: - TestSpotifyPlaylistService

final class TestSpotifyPlaylistService: XCTestCase {
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

    private func stubOrchestration(addTracksCounter: UnsafeMutablePointer<Int>? = nil) {
        StubURLProtocol.requestHandler = { request in
            guard let url = request.url else { throw SpotifyError.apiError(0, "No URL") }
            let urlString = url.absoluteString

            let data: Data
            if urlString.contains("/v1/me") && !urlString.contains("playlists") {
                data = Data("{\"id\": \"user123\"}".utf8)
            } else if urlString.contains("/users/user123/playlists") {
                data = Data("{\"id\": \"pl456\"}".utf8)
            } else if urlString.contains("/playlists/pl456/tracks") {
                addTracksCounter?.pointee += 1
                data = Data("{\"snapshot_id\": \"s1\"}".utf8)
            } else {
                data = Data("{}".utf8)
            }

            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, data)
        }
    }

    private func makeTracks(count: Int) -> [Track] {
        (0..<count).map { i in
            Track(id: "t\(i)", name: "Song \(i)", artist: "Artist",
                  album: "Album", duration: 200, playCount: 0,
                  dateAdded: Date(timeIntervalSince1970: 1_600_000_000))
        }
    }

    func testAddToRemovalPlaylistEmptyTracksReturnsEarly() async throws {
        var apiCalls = 0
        StubURLProtocol.requestHandler = { _ in
            apiCalls += 1
            guard let url = URL(string: "https://api.spotify.com") else { return (HTTPURLResponse(), Data()) }
            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data("{}".utf8))
        }

        let service = SpotifyPlaylistService()
        try await service.addToRemovalPlaylist(tracks: [])
        XCTAssertEqual(apiCalls, 0)
    }

    func testAddToRemovalPlaylistOrchestration() async throws {
        var requestURLs: [String] = []
        var requestMethods: [String] = []

        StubURLProtocol.requestHandler = { request in
            guard let url = request.url else { throw SpotifyError.apiError(0, "No URL") }
            requestURLs.append(url.absoluteString)
            requestMethods.append(request.httpMethod ?? "GET")

            let data: Data
            if url.absoluteString.contains("/v1/me") && !url.absoluteString.contains("playlists") {
                data = Data("{\"id\": \"user123\"}".utf8)
            } else if url.absoluteString.contains("/users/user123/playlists") {
                data = Data("{\"id\": \"pl456\"}".utf8)
            } else {
                data = Data("{\"snapshot_id\": \"s1\"}".utf8)
            }

            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, data)
        }

        let service = SpotifyPlaylistService()
        try await service.addToRemovalPlaylist(tracks: makeTracks(count: 2))

        XCTAssertEqual(requestURLs.count, 3)
        XCTAssertTrue(requestURLs[0].contains("/v1/me"))
        XCTAssertTrue(requestURLs[1].contains("/users/user123/playlists"))
        XCTAssertTrue(requestURLs[2].contains("/playlists/pl456/tracks"))
        XCTAssertEqual(requestMethods, ["GET", "POST", "POST"])
    }

    func testAddToRemovalPlaylistThrowsWhenNotAuthenticated() async {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: expirationKey)

        let service = SpotifyPlaylistService()
        do {
            try await service.addToRemovalPlaylist(tracks: makeTracks(count: 1))
            XCTFail("Expected error when not authenticated")
        } catch {
            XCTAssertTrue(error is SpotifyAuthError || error is SpotifyError)
        }
    }

    func testAddToRemovalPlaylistBatchChunking() async throws {
        var addTracksCount = 0
        stubOrchestration(addTracksCounter: &addTracksCount)

        let service = SpotifyPlaylistService()
        try await service.addToRemovalPlaylist(tracks: makeTracks(count: 150))

        // 150 tracks → 2 batches (100 + 50)
        XCTAssertEqual(addTracksCount, 2)
    }

    func testAddToRemovalPlaylistThrowsOnFetchUserIDError() async {
        StubURLProtocol.requestHandler = { request in
            guard let url = request.url else { throw SpotifyError.apiError(0, "No URL") }
            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: 403, httpVersion: nil, headerFields: nil)!
            return (response, Data("Forbidden".utf8))
        }

        let service = SpotifyPlaylistService()
        do {
            try await service.addToRemovalPlaylist(tracks: makeTracks(count: 1))
            XCTFail("Expected error on API failure")
        } catch let error as SpotifyError {
            if case .apiError(let code, _) = error {
                XCTAssertEqual(code, 403)
            } else {
                XCTFail("Expected apiError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testValidateResponseThrowsOnServerError() async {
        var callCount = 0
        StubURLProtocol.requestHandler = { request in
            callCount += 1
            guard let url = request.url else { throw SpotifyError.apiError(0, "No URL") }
            let status = callCount == 1 ? 200 : 500
            let data = callCount == 1 ? Data("{\"id\": \"u1\"}".utf8) : Data("Error".utf8)
            // swiftlint:disable:next force_unwrapping
            let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
            return (response, data)
        }

        let service = SpotifyPlaylistService()
        do {
            try await service.addToRemovalPlaylist(tracks: makeTracks(count: 1))
            XCTFail("Expected error on 500")
        } catch let error as SpotifyError {
            if case .apiError(let code, _) = error {
                XCTAssertEqual(code, 500)
            } else {
                XCTFail("Expected apiError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}
