import XCTest
@testable import Sift

// MARK: - TestMusicProvider

final class TestMusicProvider: XCTestCase {
    func testAppleMusicDisplayName() {
        XCTAssertEqual(MusicProvider.appleMusic.displayName, "Apple Music")
    }

    func testSpotifyDisplayName() {
        XCTAssertEqual(MusicProvider.spotify.displayName, "Spotify")
    }

    func testAppleMusicRawValue() {
        XCTAssertEqual(MusicProvider.appleMusic.rawValue, "apple-music")
    }

    func testSpotifyRawValue() {
        XCTAssertEqual(MusicProvider.spotify.rawValue, "spotify")
    }

    func testAppleMusicIconName() {
        XCTAssertEqual(MusicProvider.appleMusic.iconName, "apple.logo")
    }

    func testSpotifyIconName() {
        XCTAssertEqual(MusicProvider.spotify.iconName, "waveform")
    }

    func testAllCasesContainsBothProviders() {
        XCTAssertEqual(MusicProvider.allCases.count, 2)
        XCTAssertTrue(MusicProvider.allCases.contains(.appleMusic))
        XCTAssertTrue(MusicProvider.allCases.contains(.spotify))
    }

    func testCodableRoundTrip() throws {
        let original = MusicProvider.spotify
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MusicProvider.self, from: data)
        XCTAssertEqual(decoded, original)
    }
}
