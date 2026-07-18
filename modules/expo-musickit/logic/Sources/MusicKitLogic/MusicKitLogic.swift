// Pure decision logic extracted from ExpoMusicKitModule so it can be unit
// tested without MusicKit or a device. These files are deliberately compiled
// twice:
//   - by the ExpoMusicKit pod (the podspec's source_files glob includes
//     logic/Sources/**/*.swift), where ExpoMusicKitModule.swift calls these
//     functions directly (same target, no import needed);
//   - by the SwiftPM package rooted at modules/expo-musickit/logic, which
//     exists purely so `swift test` can run the XCTest suite in Tests/.
// Keep this file free of MusicKit / ExpoModulesCore imports and of any
// reference type or shared state — plain functions over value types only.

import Foundation

// MARK: - Batch slicing

/// Consecutive index ranges of at most `batchSize` elements covering
/// `0..<count`, in order. Empty when either argument is non-positive.
/// Extracted from the stride/min chunking used for per-track library
/// lookups and catalog batch requests.
public func batchRanges(count: Int, batchSize: Int) -> [Range<Int>] {
  guard count > 0, batchSize > 0 else { return [] }
  return stride(from: 0, to: count, by: batchSize).map { start in
    start..<min(start + batchSize, count)
  }
}

// MARK: - Catalog request→response pairing

/// Minimal metadata view of a song: just enough to decide whether two ids
/// plausibly denote the same recording.
public struct CandidateSong: Equatable {
  public let id: String
  public let title: String
  public let artist: String
  public let duration: Double?

  public init(id: String, title: String, artist: String, duration: Double?) {
    self.id = id
    self.title = title
    self.artist = artist
    self.duration = duration
  }
}

/// Whether two candidates describe the same song: title and artist equal
/// after trimming and case folding, and durations within one second when
/// both are known. A missing duration on either side does not block the
/// match — only a contradicting one does.
public func songMetadataMatches(_ a: CandidateSong, _ b: CandidateSong) -> Bool {
  func normalized(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
  guard normalized(a.title) == normalized(b.title),
        normalized(a.artist) == normalized(b.artist) else {
    return false
  }
  if let durationA = a.duration, let durationB = b.duration {
    return abs(durationA - durationB) <= 1.0
  }
  return true
}

/// The Apple Music catalog occasionally canonicalizes an id, answering a
/// batch request with the same song under a different identifier. Callers
/// look tracks up by the id they REQUESTED, so a canonicalized answer must
/// be re-keyed — but pairing an unanswered request with an unmatched
/// response by counting alone can mis-pair when one requested id genuinely
/// failed and an unrelated extra item appeared in the response. Pair only
/// when BOTH hold:
///   - the pairing is unambiguous: exactly one unanswered request id and
///     exactly one unmatched response item; and
///   - the requested song's metadata is known and matches the response
///     (title/artist equal, duration within 1s when both known).
/// Anything else returns nil: the id stays unresolved and flows through the
/// callers' shortfall accounting instead of risking caching the wrong song
/// under a real id.
public func canonicalPairing(
  unansweredRequestIDs: [String],
  unmatchedResponses: [CandidateSong],
  requestedMetadata: CandidateSong?
) -> (requestID: String, response: CandidateSong)? {
  guard unansweredRequestIDs.count == 1,
        unmatchedResponses.count == 1,
        let requestID = unansweredRequestIDs.first,
        let response = unmatchedResponses.first,
        let requested = requestedMetadata,
        songMetadataMatches(requested, response)
  else { return nil }
  return (requestID, response)
}

// MARK: - Request id hygiene

/// De-duplicate while preserving first-occurrence order. A request that
/// names the same id twice must not spawn duplicate lookups or count the
/// same resolution once per occurrence — callers diff resolution counts
/// against distinct ids.
public func uniquePreservingOrder(_ ids: [String]) -> [String] {
  var seen = Set<String>()
  return ids.filter { seen.insert($0).inserted }
}

// MARK: - Cache keying

/// Keys under which a catalog response should be cached: always the id the
/// caller REQUESTED (that is what later lookups use), plus the response's
/// own id when the catalog answered under a different (canonicalized)
/// identifier, so later answers keyed the new way also resolve.
public func cacheKeys(requestedID: String, responseID: String) -> [String] {
  requestedID == responseID ? [requestedID] : [requestedID, responseID]
}

// MARK: - createPlaylist item accounting

/// How a requested track id resolved against the module's caches.
public enum PlaylistItemResolution: Equatable {
  /// Resolved to a library Song.
  case librarySong
  /// Resolved to a non-library Track (playlist/catalog item).
  case nonLibraryTrack
  /// Not resolvable via library or catalog — skipped by the caller and
  /// surfaced as shortfall in the returned count.
  case unresolved
}

/// Count of resolvable items — the maximum a create/add call could land,
/// and the guard against creating an empty playlist when nothing resolved.
public func resolvableCount(_ resolutions: [PlaylistItemResolution]) -> Int {
  resolutions.filter { $0 != .unresolved }.count
}

/// Landed count for per-item playlist adds. `outcomes[i]` reports whether
/// the i-th RESOLVABLE item's individual add landed, in caller order;
/// unresolved items are skipped without an attempt and never consume an
/// outcome. A mid-loop failure costs only its own item — later successes
/// still count, so the caller can report the true shortfall of a
/// partially-built playlist instead of rejecting the whole call.
public func mixedAddedCount(resolutions: [PlaylistItemResolution], outcomes: [Bool]) -> Int {
  var added = 0
  var outcomeIndex = 0
  for resolution in resolutions where resolution != .unresolved {
    if outcomeIndex < outcomes.count && outcomes[outcomeIndex] {
      added += 1
    }
    outcomeIndex += 1
  }
  return added
}
