import Foundation

// MARK: - MusicServiceProtocol

protocol MusicServiceProtocol: Sendable {
    /// Request user authorization. Returns true if granted.
    func requestAuthorization() async -> Bool

    /// Whether the user is currently authorized.
    var isAuthorized: Bool { get async }

    /// Load the user's library. Returns tracks sorted by the service's default order.
    func loadLibrary() async throws -> [Track]

    /// Start playing a track at the given position (seconds).
    func play(trackID: String, at position: Double) async throws

    /// Pause the current playback.
    func pause() async throws

    /// Resume playback after a pause.
    func resume() async throws

    /// Current playback position in seconds.
    func currentPosition() async -> Double

    /// Seek to a position in seconds.
    func seek(to position: Double) async

    /// Whether audio is currently playing.
    func isPlaying() async -> Bool
}
