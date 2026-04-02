import XCTest
@testable import Sift

// MARK: - TestSimulatorMusicService

final class TestSimulatorMusicService: XCTestCase {
    func testAuthorizationAlwaysGranted() async {
        let service = SimulatorMusicService()
        let result = await service.requestAuthorization()
        XCTAssertTrue(result)
    }

    func testIsAuthorizedAlwaysTrue() async {
        let service = SimulatorMusicService()
        let authorized = await service.isAuthorized
        XCTAssertTrue(authorized)
    }

    func testLoadLibraryReturnsSampleTracks() async throws {
        let service = SimulatorMusicService()
        let tracks = try await service.loadLibrary()
        XCTAssertEqual(tracks.count, 10)
        XCTAssertEqual(tracks[0].name, "Bohemian Rhapsody")
        XCTAssertEqual(tracks[0].artist, "Queen")
    }

    func testLoadLibraryTracksHaveValidDurations() async throws {
        let service = SimulatorMusicService()
        let tracks = try await service.loadLibrary()
        for track in tracks {
            XCTAssertGreaterThan(track.duration, 0)
        }
    }

    func testInitialStateIsNotPlaying() async {
        let service = SimulatorMusicService()
        let playing = await service.isPlaying()
        XCTAssertFalse(playing)
    }

    func testPlaySetsPlayingState() async throws {
        let service = SimulatorMusicService()
        try await service.play(trackID: "sim-1", at: 0)
        let playing = await service.isPlaying()
        XCTAssertTrue(playing)
    }

    func testPauseSetsNotPlaying() async throws {
        let service = SimulatorMusicService()
        try await service.play(trackID: "sim-1", at: 0)
        try await service.pause()
        let playing = await service.isPlaying()
        XCTAssertFalse(playing)
    }

    func testResumeResetsPlaying() async throws {
        let service = SimulatorMusicService()
        try await service.play(trackID: "sim-1", at: 0)
        try await service.pause()
        try await service.resume()
        let playing = await service.isPlaying()
        XCTAssertTrue(playing)
    }

    func testPlayAtPositionSetsPosition() async throws {
        let service = SimulatorMusicService()
        try await service.play(trackID: "sim-1", at: 30.0)
        let pos = await service.currentPosition()
        XCTAssertGreaterThanOrEqual(pos, 30.0)
    }

    func testSeekUpdatesPosition() async throws {
        let service = SimulatorMusicService()
        try await service.play(trackID: "sim-1", at: 0)
        await service.seek(to: 60.0)
        let pos = await service.currentPosition()
        XCTAssertGreaterThanOrEqual(pos, 60.0)
    }

    func testPositionDoesNotAdvanceWhenPaused() async throws {
        let service = SimulatorMusicService()
        try await service.play(trackID: "sim-1", at: 10.0)
        try await service.pause()
        let pos1 = await service.currentPosition()
        try? await Task.sleep(for: .milliseconds(50))
        let pos2 = await service.currentPosition()
        XCTAssertEqual(pos1, pos2, accuracy: 0.001)
    }
}
