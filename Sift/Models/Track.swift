import Foundation

struct Track: Identifiable, Codable, Equatable {
    let id: String           // Music.app persistent ID
    let name: String
    let artist: String
    let album: String
    let duration: Double     // seconds
    let playCount: Int
    let dateAdded: Date

    static func == (lhs: Track, rhs: Track) -> Bool {
        lhs.id == rhs.id
    }
}
