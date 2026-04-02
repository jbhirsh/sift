import XCTest
@testable import Sift

// MARK: - TestSpotifyTrackDecoding

final class TestSpotifyTrackDecoding: XCTestCase {
    func testDecodesTrackWithAllFields() throws {
        let json = Data("""
        {
            "id": "3n3Ppam7vgaVa1iaRUc9Lp",
            "name": "Mr. Brightside",
            "artists": [{"name": "The Killers"}],
            "album": {
                "name": "Hot Fuss",
                "images": [
                    {"url": "https://i.scdn.co/image/large", "width": 640, "height": 640},
                    {"url": "https://i.scdn.co/image/small", "width": 64, "height": 64}
                ]
            },
            "duration_ms": 222973,
            "preview_url": "https://p.scdn.co/mp3-preview/abc123"
        }
        """.utf8)
        let track = try JSONDecoder().decode(SpotifyTrack.self, from: json)
        XCTAssertEqual(track.id, "3n3Ppam7vgaVa1iaRUc9Lp")
        XCTAssertEqual(track.name, "Mr. Brightside")
        XCTAssertEqual(track.artists.count, 1)
        XCTAssertEqual(track.artists.first?.name, "The Killers")
        XCTAssertEqual(track.album.name, "Hot Fuss")
        XCTAssertEqual(track.album.images.count, 2)
        XCTAssertEqual(track.durationMs, 222_973)
        XCTAssertEqual(track.previewURL, "https://p.scdn.co/mp3-preview/abc123")
    }

    func testDecodesTrackWithNullPreviewURL() throws {
        let json = Data("""
        {
            "id": "abc",
            "name": "No Preview",
            "artists": [{"name": "Artist"}],
            "album": {"name": "Album", "images": []},
            "duration_ms": 180000,
            "preview_url": null
        }
        """.utf8)
        let track = try JSONDecoder().decode(SpotifyTrack.self, from: json)
        XCTAssertNil(track.previewURL)
    }

    func testDecodesTrackWithMultipleArtists() throws {
        let json = Data("""
        {
            "id": "collab",
            "name": "Collab Song",
            "artists": [{"name": "Artist A"}, {"name": "Artist B"}, {"name": "Artist C"}],
            "album": {"name": "Collabs", "images": []},
            "duration_ms": 200000,
            "preview_url": null
        }
        """.utf8)
        let track = try JSONDecoder().decode(SpotifyTrack.self, from: json)
        XCTAssertEqual(track.artists.count, 3)
        XCTAssertEqual(track.artists.map(\.name), ["Artist A", "Artist B", "Artist C"])
    }
}

// MARK: - TestSpotifyAlbumDecoding

final class TestSpotifyAlbumDecoding: XCTestCase {
    func testDecodesAlbumWithImages() throws {
        let json = Data("""
        {
            "name": "Hot Fuss",
            "images": [
                {"url": "https://i.scdn.co/image/large", "width": 640, "height": 640},
                {"url": "https://i.scdn.co/image/medium", "width": 300, "height": 300},
                {"url": "https://i.scdn.co/image/small", "width": 64, "height": 64}
            ]
        }
        """.utf8)
        let album = try JSONDecoder().decode(SpotifyAlbum.self, from: json)
        XCTAssertEqual(album.name, "Hot Fuss")
        XCTAssertEqual(album.images.count, 3)
    }

    func testDecodesAlbumWithEmptyImages() throws {
        let json = Data("""
        {"name": "No Art Album", "images": []}
        """.utf8)
        let album = try JSONDecoder().decode(SpotifyAlbum.self, from: json)
        XCTAssertEqual(album.name, "No Art Album")
        XCTAssertTrue(album.images.isEmpty)
    }
}

// MARK: - TestSpotifyImageDecoding

final class TestSpotifyImageDecoding: XCTestCase {
    func testDecodesImageWithDimensions() throws {
        let json = Data("""
        {"url": "https://i.scdn.co/image/abc", "width": 640, "height": 640}
        """.utf8)
        let image = try JSONDecoder().decode(SpotifyImage.self, from: json)
        XCTAssertEqual(image.url, "https://i.scdn.co/image/abc")
        XCTAssertEqual(image.width, 640)
        XCTAssertEqual(image.height, 640)
    }

    func testDecodesImageWithNullDimensions() throws {
        let json = Data("""
        {"url": "https://i.scdn.co/image/abc", "width": null, "height": null}
        """.utf8)
        let image = try JSONDecoder().decode(SpotifyImage.self, from: json)
        XCTAssertNil(image.width)
        XCTAssertNil(image.height)
    }
}

// MARK: - TestSpotifySavedTrackDecoding

final class TestSpotifySavedTrackDecoding: XCTestCase {
    func testDecodesWithISO8601AddedAt() throws {
        let json = Data("""
        {
            "added_at": "2023-06-15T10:30:00Z",
            "track": {
                "id": "t1",
                "name": "Song",
                "artists": [{"name": "Artist"}],
                "album": {"name": "Album", "images": []},
                "duration_ms": 180000,
                "preview_url": null
            }
        }
        """.utf8)
        let saved = try JSONDecoder().decode(SpotifySavedTrack.self, from: json)
        XCTAssertNotNil(saved.addedAt)
        XCTAssertEqual(saved.track.name, "Song")
    }

    func testDecodesWithNullAddedAt() throws {
        let json = Data("""
        {
            "added_at": null,
            "track": {
                "id": "t1",
                "name": "Song",
                "artists": [{"name": "Artist"}],
                "album": {"name": "Album", "images": []},
                "duration_ms": 180000,
                "preview_url": null
            }
        }
        """.utf8)
        let saved = try JSONDecoder().decode(SpotifySavedTrack.self, from: json)
        XCTAssertNil(saved.addedAt)
    }

    func testDecodesWithMissingAddedAt() throws {
        let json = Data("""
        {
            "track": {
                "id": "t1",
                "name": "Song",
                "artists": [{"name": "Artist"}],
                "album": {"name": "Album", "images": []},
                "duration_ms": 180000,
                "preview_url": null
            }
        }
        """.utf8)
        let saved = try JSONDecoder().decode(SpotifySavedTrack.self, from: json)
        XCTAssertNil(saved.addedAt)
    }
}

// MARK: - TestSpotifyPageDecoding

final class TestSpotifyPageDecoding: XCTestCase {
    func testDecodesPageWithNextURL() throws {
        let json = Data("""
        {
            "items": [
                {
                    "added_at": "2023-01-01T00:00:00Z",
                    "track": {
                        "id": "t1",
                        "name": "Track One",
                        "artists": [{"name": "Artist"}],
                        "album": {"name": "Album", "images": []},
                        "duration_ms": 200000,
                        "preview_url": null
                    }
                }
            ],
            "next": "https://api.spotify.com/v1/me/tracks?offset=50&limit=50"
        }
        """.utf8)
        let page = try JSONDecoder().decode(SpotifyPage.self, from: json)
        XCTAssertEqual(page.items.count, 1)
        XCTAssertEqual(page.items.first?.track.name, "Track One")
        XCTAssertNotNil(page.next)
    }

    func testDecodesLastPageWithNullNext() throws {
        let json = Data("""
        {
            "items": [
                {
                    "added_at": "2023-01-01T00:00:00Z",
                    "track": {
                        "id": "t1",
                        "name": "Last Track",
                        "artists": [{"name": "Artist"}],
                        "album": {"name": "Album", "images": []},
                        "duration_ms": 200000,
                        "preview_url": null
                    }
                }
            ],
            "next": null
        }
        """.utf8)
        let page = try JSONDecoder().decode(SpotifyPage.self, from: json)
        XCTAssertNil(page.next)
    }

    func testDecodesEmptyPage() throws {
        let json = Data("""
        {"items": [], "next": null}
        """.utf8)
        let page = try JSONDecoder().decode(SpotifyPage.self, from: json)
        XCTAssertTrue(page.items.isEmpty)
        XCTAssertNil(page.next)
    }
}
