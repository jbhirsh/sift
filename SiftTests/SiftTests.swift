import XCTest
@testable import Sift

// MARK: - Mock playlist service

final class MockPlaylistService: PlaylistService {
    var addedTracks: [Track] = []
    var shouldThrow = false

    func addToRemovalPlaylist(tracks: [Track]) async throws {
        if shouldThrow { throw PlaylistError.noMatchingSongs }
        addedTracks = tracks
    }
}

// MARK: - Mock music service

actor MockMusicService: MusicServiceProtocol {
    var authorized = true
    var tracksToReturn: [Track] = []
    var shouldThrow = false
    var customError: Error?
    private var playing = false
    private var position: Double = 0

    func setAuthorized(_ value: Bool) {
        authorized = value
    }

    func setTracksToReturn(_ tracks: [Track]) {
        tracksToReturn = tracks
    }

    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }

    func setCustomError(_ error: Error?) {
        customError = error
        if error != nil { shouldThrow = true }
    }

    func requestAuthorization() async -> Bool {
        authorized
    }

    var isAuthorized: Bool {
        authorized
    }

    func loadLibrary() async throws -> [Track] {
        if let customError { throw customError }
        if shouldThrow { throw MusicError.libraryNotFound }
        return tracksToReturn
    }

    func play(trackID: String, at pos: Double) async throws {
        playing = true
        position = pos
    }

    func pause() async throws { playing = false }
    func resume() async throws { playing = true }
    func currentPosition() async -> Double { position }
    func seek(to pos: Double) async { position = pos }
    func isPlaying() async -> Bool { playing }
}
