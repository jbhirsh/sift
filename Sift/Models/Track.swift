import Foundation

struct Track: Identifiable, Codable, Equatable {
    let id: String           // Service-specific track ID
    let name: String
    let artist: String
    let album: String
    let duration: Double     // seconds
    let playCount: Int
    let dateAdded: Date
    let artworkURL: URL?
    let previewURL: URL?

    init(id: String, name: String, artist: String, album: String,
         duration: Double, playCount: Int, dateAdded: Date,
         artworkURL: URL? = nil, previewURL: URL? = nil) {
        self.id = id
        self.name = name
        self.artist = artist
        self.album = album
        self.duration = duration
        self.playCount = playCount
        self.dateAdded = dateAdded
        self.artworkURL = artworkURL
        self.previewURL = previewURL
    }

    static func == (lhs: Track, rhs: Track) -> Bool {
        lhs.id == rhs.id
    }
}
