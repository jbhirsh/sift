import Foundation

// MARK: - SimulatorMusicService

/// A mock music service for the iOS simulator where MusicKit has no real library.
/// Returns sample tracks with time-based playback simulation.
actor SimulatorMusicService: MusicServiceProtocol {
    private var playing = false
    private var position: Double = 0
    private var startTime: Date?

    // MARK: - Authorization

    func requestAuthorization() async -> Bool { true }

    var isAuthorized: Bool { true }

    // MARK: - Library

    func loadLibrary() async throws -> [Track] {
        [
            Track(id: "sim-1", name: "Bohemian Rhapsody", artist: "Queen",
                  album: "A Night at the Opera", duration: 354, playCount: 42,
                  dateAdded: Date(timeIntervalSince1970: 1_600_000_000)),
            Track(id: "sim-2", name: "Blinding Lights", artist: "The Weeknd",
                  album: "After Hours", duration: 200, playCount: 88,
                  dateAdded: Date(timeIntervalSince1970: 1_610_000_000)),
            Track(id: "sim-3", name: "Levitating", artist: "Dua Lipa",
                  album: "Future Nostalgia", duration: 203, playCount: 65,
                  dateAdded: Date(timeIntervalSince1970: 1_615_000_000)),
            Track(id: "sim-4", name: "drivers license", artist: "Olivia Rodrigo",
                  album: "SOUR", duration: 242, playCount: 31,
                  dateAdded: Date(timeIntervalSince1970: 1_620_000_000)),
            Track(id: "sim-5", name: "Stay", artist: "The Kid LAROI & Justin Bieber",
                  album: "F*CK LOVE 3: OVER YOU", duration: 141, playCount: 55,
                  dateAdded: Date(timeIntervalSince1970: 1_625_000_000)),
            Track(id: "sim-6", name: "good 4 u", artist: "Olivia Rodrigo",
                  album: "SOUR", duration: 178, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_620_100_000)),
            Track(id: "sim-7", name: "Peaches", artist: "Justin Bieber",
                  album: "Justice", duration: 198, playCount: 29,
                  dateAdded: Date(timeIntervalSince1970: 1_617_000_000)),
            Track(id: "sim-8", name: "Montero", artist: "Lil Nas X",
                  album: "Montero", duration: 137, playCount: 38,
                  dateAdded: Date(timeIntervalSince1970: 1_630_000_000)),
            Track(id: "sim-9", name: "Kiss Me More", artist: "Doja Cat ft. SZA",
                  album: "Planet Her", duration: 208, playCount: 52,
                  dateAdded: Date(timeIntervalSince1970: 1_622_000_000)),
            Track(id: "sim-10", name: "Heat Waves", artist: "Glass Animals",
                  album: "Dreamland", duration: 238, playCount: 73,
                  dateAdded: Date(timeIntervalSince1970: 1_612_000_000))
        ]
    }

    // MARK: - Playback (simulated via elapsed time)

    func play(trackID: String, at position: Double) async throws {
        self.position = position
        startTime = Date()
        playing = true
    }

    func pause() async throws {
        position = currentPosition()
        startTime = nil
        playing = false
    }

    func resume() async throws {
        startTime = Date()
        playing = true
    }

    func currentPosition() -> Double {
        guard playing, let start = startTime else { return position }
        return position + Date().timeIntervalSince(start)
    }

    func seek(to position: Double) {
        self.position = position
        if playing { startTime = Date() }
    }

    func isPlaying() -> Bool { playing }
}
