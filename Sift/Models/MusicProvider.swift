import Foundation

enum MusicProvider: String, Codable, CaseIterable {
    case appleMusic = "apple-music"
    case spotify    = "spotify"

    var displayName: String {
        switch self {
        case .appleMusic: return "Apple Music"
        case .spotify:    return "Spotify"
        }
    }

    var iconName: String {
        switch self {
        case .appleMusic: return "apple.logo"
        case .spotify:    return "waveform"
        }
    }
}
