import Foundation

// MARK: - Protocol

protocol PlaylistService {
    func addToRemovalPlaylist(tracks: [Track]) async throws
}

// MARK: - Errors

enum PlaylistError: Error, LocalizedError {
    case scriptCreationFailed
    case executionFailed(String)

    var errorDescription: String? {
        switch self {
        case .scriptCreationFailed:
            return "Failed to create AppleScript."
        case .executionFailed(let msg):
            return "Music automation failed: \(msg)"
        }
    }
}

// MARK: - Script builder (pure function — unit-testable)

func buildRemovalPlaylistScript(tracks: [Track], playlistName: String = "Sift — To Remove") -> String {
    var lines: [String] = [
        "tell application \"Music\"",
        "    if not (exists playlist \"\(playlistName)\") then",
        "        make new playlist with properties {name:\"\(playlistName)\"}",
        "    end if",
        "    set targetPlaylist to playlist \"\(playlistName)\""
    ]

    for track in tracks {
        let name   = track.name.replacingOccurrences(of: "\"", with: "\\\"")
        let artist = track.artist.replacingOccurrences(of: "\"", with: "\\\"")
        let matchLine = "    set matchingTracks to " +
            "(every track of library playlist 1 whose name is \"\(name)\" and artist is \"\(artist)\")"
        lines += [
            matchLine,
            "    if length of matchingTracks > 0 then",
            "        duplicate (item 1 of matchingTracks) to targetPlaylist",
            "    end if"
        ]
    }

    lines.append("end tell")
    return lines.joined(separator: "\n")
}

// MARK: - Concrete implementation

final class AppleScriptPlaylistService: PlaylistService {
    func addToRemovalPlaylist(tracks: [Track]) async throws {
        guard !tracks.isEmpty else { return }
        let script = buildRemovalPlaylistScript(tracks: tracks)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            DispatchQueue.global(qos: .userInitiated).async {
                var errorDict: NSDictionary?
                guard let appleScript = NSAppleScript(source: script) else {
                    continuation.resume(throwing: PlaylistError.scriptCreationFailed)
                    return
                }
                appleScript.executeAndReturnError(&errorDict)
                if let errorDict,
                   let message = errorDict["NSAppleScriptErrorMessage"] as? String {
                    continuation.resume(throwing: PlaylistError.executionFailed(message))
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }
}
