import AppKit
import Foundation
import ScriptingBridge

// MARK: - ScriptingBridge protocols for Music.app
// Collections are @objc optional func returning SBElementArray (not var).
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

// MARK: - Errors

enum MusicError: Error, LocalizedError {
    case appNotFound
    case libraryNotFound
    case trackNotFound(String)

    var errorDescription: String? {
        switch self {
        case .appNotFound:       return "Music.app could not be found or launched."
        case .libraryNotFound:   return "Could not access your Music library."
        case .trackNotFound(let id): return "Track \(id) not found in library."
        }
    }
}

// MARK: - MusicService

actor MusicService {
    private var sbApp: SBApplication?
    /// Cached ScriptingBridge track objects keyed by persistentID.
    /// Populated on loadLibrary() and used for all subsequent operations.
    private var trackCache: [String: any MusicTrack] = [:]

    // MARK: - Private helpers

    private func getApp() throws -> SBApplication {
        if let existing = sbApp { return existing }
        guard let app = SBApplication(bundleIdentifier: "com.apple.Music") else {
            throw MusicError.appNotFound
        }
        sbApp = app
        return app
    }

    private func musicProtocol() throws -> any MusicApplication {
        try getApp() as any MusicApplication
    }

    /// Returns all MusicTrack SBObjects from the first library source.
    private func allSBTracks() throws -> [any MusicTrack] {
        let app = try musicProtocol()

        guard let sourcesArr = app.sources?() else { throw MusicError.libraryNotFound }
        let sources = sourcesArr.compactMap { $0 as? any MusicSource }

        guard let library = sources.first(where: { $0.kind == .library }),
              let playlistsArr = library.libraryPlaylists?() else {
            throw MusicError.libraryNotFound
        }
        let playlists = playlistsArr.compactMap { $0 as? any MusicLibraryPlaylist }

        guard let libraryPlaylist = playlists.first,
              let tracksArr = libraryPlaylist.tracks?() else {
            throw MusicError.libraryNotFound
        }
        return tracksArr.compactMap { $0 as? any MusicTrack }
    }

    // MARK: - Public API

    func loadLibrary() async throws -> [Track] {
        let sbTracks = try allSBTracks()

        var result: [Track] = []
        var cache: [String: any MusicTrack] = [:]

        for sbTrack in sbTracks {
            guard let id = sbTrack.persistentID,
                  let name = sbTrack.name else { continue }
            cache[id] = sbTrack
            result.append(Track(
                id: id,
                name: name,
                artist: sbTrack.artist ?? "",
                album: sbTrack.album ?? "",
                duration: sbTrack.duration ?? 0,
                playCount: sbTrack.playedCount ?? 0,
                dateAdded: sbTrack.dateAdded ?? Date.distantPast
            ))
        }

        trackCache = cache
        return result
    }

    func play(trackID: String, at position: Double = 0) throws {
        guard let track = trackCache[trackID] else {
            throw MusicError.trackNotFound(trackID)
        }
        track.playOnce?(false)
        if position > 0 {
            try getApp().setValue(position, forKey: "playerPosition")
        }
    }

    func currentPosition() throws -> Double {
        try musicProtocol().playerPosition ?? 0
    }

    func seek(to position: Double) throws {
        try getApp().setValue(position, forKey: "playerPosition")
    }

    func pause() throws {
        try musicProtocol().pause?()
    }

    func resume() throws {
        try musicProtocol().play?()
    }

    func isPlaying() throws -> Bool {
        try musicProtocol().playerState == .playing
    }

    func artwork(forTrackID trackID: String) throws -> NSImage? {
        guard let track = trackCache[trackID],
              let artworksArr = track.artworks?(),
              let first = artworksArr.compactMap({ $0 as? any MusicArtwork }).first else {
            return nil
        }
        return first.data
    }

    func deleteTrack(id trackID: String) throws {
        guard let track = trackCache[trackID] else {
            throw MusicError.trackNotFound(trackID)
        }
        track.delete?()
        trackCache.removeValue(forKey: trackID)
    }
}
