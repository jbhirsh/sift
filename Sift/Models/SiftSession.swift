import Foundation

enum SortOrder: String, Codable, CaseIterable {
    case leastPlayed = "least-played"
    case mostPlayed  = "most-played"
    case oldest      = "oldest"
    case newest      = "newest"
    case random      = "random"

    var displayName: String {
        switch self {
        case .leastPlayed: return "Least Played"
        case .mostPlayed:  return "Most Played"
        case .oldest:      return "Oldest Added"
        case .newest:      return "Newest Added"
        case .random:      return "Random"
        }
    }
}

struct SiftSession: Codable {
    var tracks: [Track]
    var cursor: Int
    var kept: [Track]
    var removed: [Track]
    var skipped: [Track]
    var sortOrder: SortOrder
    var savedAt: Date

    var remaining: Int { max(0, tracks.count - cursor) }
    var total: Int { tracks.count }
}
