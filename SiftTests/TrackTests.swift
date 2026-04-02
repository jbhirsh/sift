import XCTest
@testable import Sift

// MARK: - TestTrack

final class TestTrack: XCTestCase {
    func testEqualityById() {
        // Two entries for the same song should be equal regardless of differing metadata
        let original = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                             album: "The Definition", duration: 213, playCount: 47,
                             dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        let duplicate = Track(id: "allTimelow-jon-bellion", name: "All Time Low (Remix)",
                              artist: "Jon Bellion", album: "Deluxe Edition",
                              duration: 220, playCount: 99,
                              dateAdded: Date(timeIntervalSince1970: 1_500_000_000))
        XCTAssertEqual(original, duplicate)
    }

    func testInequalityById() {
        let allTimeLow = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                               album: "The Definition", duration: 213, playCount: 47,
                               dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        let sweetButPsycho = Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho",
                                   artist: "Ava Max", album: "Heaven & Hell", duration: 196,
                                   playCount: 23, dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        XCTAssertNotEqual(allTimeLow, sweetButPsycho)
    }

    func testArtworkURLDefaultsToNil() {
        let track = Track(id: "t1", name: "Song", artist: "Artist",
                          album: "Album", duration: 180, playCount: 0,
                          dateAdded: Date())
        XCTAssertNil(track.artworkURL)
    }

    func testArtworkURLPreservedThroughCodable() throws {
        let url = URL(string: "https://example.com/art.jpg")
        let track = Track(id: "t1", name: "Song", artist: "Artist",
                          album: "Album", duration: 180, playCount: 0,
                          dateAdded: Date(), artworkURL: url)
        let data = try JSONEncoder().encode(track)
        let decoded = try JSONDecoder().decode(Track.self, from: data)
        XCTAssertEqual(decoded.artworkURL, url)
    }

    func testTrackWithoutArtworkURLDecodesFromOldFormat() throws {
        // Simulates decoding a Track saved before artworkURL was added
        let json = Data("""
        {
            "id": "t1", "name": "Song", "artist": "Artist",
            "album": "Album", "duration": 180, "playCount": 0,
            "dateAdded": 0
        }
        """.utf8)
        let track = try JSONDecoder().decode(Track.self, from: json)
        XCTAssertNil(track.artworkURL)
    }

    func testPreviewURLDefaultsToNil() {
        let track = Track(id: "t1", name: "Song", artist: "Artist",
                          album: "Album", duration: 180, playCount: 0,
                          dateAdded: Date())
        XCTAssertNil(track.previewURL)
    }

    func testPreviewURLPreservedThroughCodable() throws {
        let url = URL(string: "https://p.scdn.co/mp3-preview/abc123")
        let track = Track(id: "t1", name: "Song", artist: "Artist",
                          album: "Album", duration: 180, playCount: 0,
                          dateAdded: Date(), previewURL: url)
        let data = try JSONEncoder().encode(track)
        let decoded = try JSONDecoder().decode(Track.self, from: data)
        XCTAssertEqual(decoded.previewURL, url)
    }

    func testTrackWithoutPreviewURLDecodesFromOldFormat() throws {
        // Simulates decoding a Track saved before previewURL was added
        let json = Data("""
        {
            "id": "t1", "name": "Song", "artist": "Artist",
            "album": "Album", "duration": 180, "playCount": 0,
            "dateAdded": 0
        }
        """.utf8)
        let track = try JSONDecoder().decode(Track.self, from: json)
        XCTAssertNil(track.previewURL)
    }
}
