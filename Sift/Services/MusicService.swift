import AppKit
import Foundation
import ScriptingBridge

// MARK: - ScriptingBridge protocols for Music.app
// These mirror the generated Music.h header. We define only what we need.

// In ScriptingBridge, element collections are methods that return SBElementArray.
// Scalar properties remain as vars.

@objc protocol MusicApplication {
    @objc optional var currentTrack: MusicTrack { get }
    @objc optional var playerPosition: Double { get set }
    @objc optional var playerState: MusicEPlayerState { get }
    @objc optional func play()
    @objc optional func pause()
    @objc optional func stop()
    @objc optional func playpause()
    @objc optional func sources() -> SBElementArray
}

@objc protocol MusicSource {
    @objc optional func libraryPlaylists() -> SBElementArray
    @objc optional func playlists() -> SBElementArray
    @objc optional var name: String { get }
    @objc optional var kind: MusicESourceKind { get }
}

@objc protocol MusicLibraryPlaylist {
    @objc optional func tracks() -> SBElementArray
    @objc optional var name: String { get }
}

@objc protocol MusicTrack {
    @objc optional var persistentID: String { get }
    @objc optional var name: String { get }
    @objc optional var artist: String { get }
    @objc optional var album: String { get }
    @objc optional var duration: Double { get }
    @objc optional var playedCount: Int { get }
    @objc optional var dateAdded: Date { get }
    @objc optional func playOnce(_ flag: Bool)
    @objc optional func delete()
    @objc optional func artworks() -> SBElementArray
}

@objc protocol MusicArtwork {
    @objc optional var data: NSImage { get }
}

@objc enum MusicEPlayerState: Int {
    case stopped   = 0x6b505353
    case playing   = 0x6b505350
    case paused    = 0x6b505370
    case rewinding = 0x6b505352
    case advancing = 0x6b505346
}

@objc enum MusicESourceKind: Int {
    case library       = 0x6b4c6962
    case iTunesStore   = 0x6b495453
    case iPod          = 0x6b69506f
    case audioCD       = 0x6b414344
    case radioTuner    = 0x6b54756e
    case sharedLibrary = 0x6b536864
    case unknown       = 0x6b556e6b
}

extension SBApplication: MusicApplication {}

// MARK: - MusicService

enum MusicError: Error {
    case appNotFound
    case libraryNotFound
    case trackNotFound(String)
}

actor MusicService {
    private var sbApp: SBApplication?

    private func getApp() throws -> SBApplication {
        if let existing = sbApp { return existing }
        guard let app = SBApplication(bundleIdentifier: "com.apple.Music") else {
            throw MusicError.appNotFound
        }
        sbApp = app
        return app
    }

    private func musicApp() throws -> any MusicApplication {
        try getApp() as any MusicApplication
    }

    func loadLibrary() async throws -> [Track] {
        let app = try musicApp()

        guard let sources = app.sources?() as? [any MusicSource],
              let library = sources.first(where: { $0.kind == .library }),
              let playlists = library.libraryPlaylists?() as? [any MusicLibraryPlaylist],
              let libraryPlaylist = playlists.first,
              let sbTracks = libraryPlaylist.tracks?() as? [any MusicTrack] else {
            throw MusicError.libraryNotFound
        }

        return sbTracks.compactMap { sbTrack -> Track? in
            guard let id = sbTrack.persistentID,
                  let name = sbTrack.name else { return nil }
            return Track(
                id: id,
                name: name,
                artist: sbTrack.artist ?? "",
                album: sbTrack.album ?? "",
                duration: sbTrack.duration ?? 0,
                playCount: sbTrack.playedCount ?? 0,
                dateAdded: sbTrack.dateAdded ?? Date.distantPast
            )
        }
    }

    func play(trackID: String, at position: Double = 0) throws {
        let app = try musicApp()

        guard let sources = app.sources?() as? [any MusicSource],
              let library = sources.first(where: { $0.kind == .library }),
              let playlists = library.libraryPlaylists?() as? [any MusicLibraryPlaylist],
              let libraryPlaylist = playlists.first,
              let sbTracks = libraryPlaylist.tracks?() as? [any MusicTrack],
              let track = sbTracks.first(where: { $0.persistentID == trackID }) else {
            throw MusicError.trackNotFound(trackID)
        }

        track.playOnce?(false)
        if position > 0 {
            try getApp().setValue(position, forKey: "playerPosition")
        }
    }

    func currentPosition() throws -> Double {
        try musicApp().playerPosition ?? 0
    }

    func seek(to position: Double) throws {
        try getApp().setValue(position, forKey: "playerPosition")
    }

    func pause() throws {
        try musicApp().pause?()
    }

    func resume() throws {
        try musicApp().play?()
    }

    func isPlaying() throws -> Bool {
        try musicApp().playerState == .playing
    }

    func artwork(forTrackID trackID: String) throws -> NSImage? {
        let app = try musicApp()

        guard let sources = app.sources?() as? [any MusicSource],
              let library = sources.first(where: { $0.kind == .library }),
              let playlists = library.libraryPlaylists?() as? [any MusicLibraryPlaylist],
              let libraryPlaylist = playlists.first,
              let sbTracks = libraryPlaylist.tracks?() as? [any MusicTrack],
              let track = sbTracks.first(where: { $0.persistentID == trackID }),
              let artworks = track.artworks?() as? [any MusicArtwork],
              let artwork = artworks.first else {
            return nil
        }

        return artwork.data
    }

    func deleteTrack(id trackID: String) throws {
        let app = try musicApp()

        guard let sources = app.sources?() as? [any MusicSource],
              let library = sources.first(where: { $0.kind == .library }),
              let playlists = library.libraryPlaylists?() as? [any MusicLibraryPlaylist],
              let libraryPlaylist = playlists.first,
              let sbTracks = libraryPlaylist.tracks?() as? [any MusicTrack],
              let track = sbTracks.first(where: { $0.persistentID == trackID }) else {
            throw MusicError.trackNotFound(trackID)
        }

        track.delete?()
    }
}
