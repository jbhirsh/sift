import XCTest
import MusicKitLogic

final class BatchRangesTests: XCTestCase {
  func testZeroItemsYieldsNoRanges() {
    XCTAssertEqual(batchRanges(count: 0, batchSize: 100), [])
  }

  func testSingleItemYieldsOnePartialRange() {
    XCTAssertEqual(batchRanges(count: 1, batchSize: 100), [0..<1])
  }

  func testJustUnderBatchSizeYieldsOnePartialRange() {
    XCTAssertEqual(batchRanges(count: 99, batchSize: 100), [0..<99])
  }

  func testExactBatchSizeYieldsOneFullRange() {
    XCTAssertEqual(batchRanges(count: 100, batchSize: 100), [0..<100])
  }

  func testJustOverBatchSizeYieldsFullPlusRemainder() {
    XCTAssertEqual(batchRanges(count: 101, batchSize: 100), [0..<100, 100..<101])
  }

  func testMultipleBatchesWithRemainder() {
    XCTAssertEqual(
      batchRanges(count: 250, batchSize: 100),
      [0..<100, 100..<200, 200..<250]
    )
  }

  func testRangesTileTheWholeInputWithoutGapsOrOverlap() {
    let ranges = batchRanges(count: 250, batchSize: 100)
    XCTAssertEqual(ranges.first?.lowerBound, 0)
    XCTAssertEqual(ranges.last?.upperBound, 250)
    for (previous, next) in zip(ranges, ranges.dropFirst()) {
      XCTAssertEqual(previous.upperBound, next.lowerBound)
    }
    XCTAssertEqual(ranges.reduce(0) { $0 + $1.count }, 250)
  }

  func testNonPositiveBatchSizeYieldsNoRanges() {
    XCTAssertEqual(batchRanges(count: 10, batchSize: 0), [])
    XCTAssertEqual(batchRanges(count: 10, batchSize: -1), [])
  }
}

final class CanonicalPairingTests: XCTestCase {
  private let requested = CandidateSong(
    id: "req-1", title: "Heat Waves", artist: "Glass Animals", duration: 238
  )

  private func response(
    id: String = "resp-9",
    title: String = "Heat Waves",
    artist: String = "Glass Animals",
    duration: Double? = 238
  ) -> CandidateSong {
    CandidateSong(id: id, title: title, artist: artist, duration: duration)
  }

  func testAcceptedOnExactMetadataMatch() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response()],
      requestedMetadata: requested
    )
    XCTAssertEqual(pairing?.requestID, "req-1")
    XCTAssertEqual(pairing?.response.id, "resp-9")
  }

  func testAcceptedWhenDurationWithinOneSecond() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response(duration: 238.9)],
      requestedMetadata: requested
    )
    XCTAssertNotNil(pairing)
  }

  func testAcceptedWhenOneDurationUnknown() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response(duration: nil)],
      requestedMetadata: requested
    )
    XCTAssertNotNil(pairing)
  }

  func testAcceptedWithCaseAndWhitespaceDifferences() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response(title: "  heat waves ", artist: "GLASS ANIMALS")],
      requestedMetadata: requested
    )
    XCTAssertNotNil(pairing)
  }

  func testRejectedWithoutRequestedMetadata() {
    // No requested-side metadata means the pairing cannot be validated —
    // the id must stay unresolved (shortfall) rather than adopt a possibly
    // unrelated response item.
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response()],
      requestedMetadata: nil
    )
    XCTAssertNil(pairing)
  }

  func testRejectedOnTitleMismatch() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response(title: "Different Song")],
      requestedMetadata: requested
    )
    XCTAssertNil(pairing)
  }

  func testRejectedOnArtistMismatch() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response(artist: "Someone Else")],
      requestedMetadata: requested
    )
    XCTAssertNil(pairing)
  }

  func testRejectedWhenDurationDiffersByMoreThanOneSecond() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response(duration: 240.5)],
      requestedMetadata: requested
    )
    XCTAssertNil(pairing)
  }

  func testRejectedWhenMultipleRequestsUnanswered() {
    // Two unanswered ids and one extra response: the extra item could be
    // the canonicalization of either — ambiguous, so no pairing.
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1", "req-2"],
      unmatchedResponses: [response()],
      requestedMetadata: requested
    )
    XCTAssertNil(pairing)
  }

  func testRejectedWhenMultipleResponsesUnmatched() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [response(), response(id: "resp-10")],
      requestedMetadata: requested
    )
    XCTAssertNil(pairing)
  }

  func testRejectedWhenNothingUnmatched() {
    let pairing = canonicalPairing(
      unansweredRequestIDs: ["req-1"],
      unmatchedResponses: [],
      requestedMetadata: requested
    )
    XCTAssertNil(pairing)
  }
}

final class CacheKeysTests: XCTestCase {
  func testDirectAnswerKeysOnlyTheRequestedID() {
    XCTAssertEqual(cacheKeys(requestedID: "a", responseID: "a"), ["a"])
  }

  func testCanonicalizedAnswerKeysRequestedThenResponseID() {
    // Requested id first: that is the id callers look up by; the response
    // id rides along so later catalog answers keyed the new way resolve too.
    XCTAssertEqual(cacheKeys(requestedID: "a", responseID: "b"), ["a", "b"])
  }
}

final class UniquePreservingOrderTests: XCTestCase {
  func testKeepsFirstOccurrenceOrder() {
    XCTAssertEqual(uniquePreservingOrder(["b", "a", "b", "c", "a"]), ["b", "a", "c"])
  }

  func testNoDuplicatesIsIdentity() {
    XCTAssertEqual(uniquePreservingOrder(["a", "b", "c"]), ["a", "b", "c"])
  }

  func testEmptyInput() {
    XCTAssertEqual(uniquePreservingOrder([]), [])
  }
}

final class CreatePlaylistAccountingTests: XCTestCase {
  func testResolvableCountSkipsUnresolved() {
    XCTAssertEqual(
      resolvableCount([.librarySong, .unresolved, .nonLibraryTrack, .librarySong]),
      3
    )
    XCTAssertEqual(resolvableCount([]), 0)
  }

  func testMixedAddedCountAllLand() {
    XCTAssertEqual(
      mixedAddedCount(
        resolutions: [.librarySong, .nonLibraryTrack],
        outcomes: [true, true]
      ),
      2
    )
  }

  func testMixedAddedCountMidLoopFailureCostsOnlyItsOwnItem() {
    // Caller order: song lands, track fails mid-loop, song lands after.
    // The failure is counted as shortfall while later items still count.
    XCTAssertEqual(
      mixedAddedCount(
        resolutions: [.librarySong, .nonLibraryTrack, .librarySong],
        outcomes: [true, false, true]
      ),
      2
    )
  }

  func testMixedAddedCountSkipsUnresolvedWithoutConsumingAnOutcome() {
    // The unresolved id gets no add attempt: outcomes align with the
    // resolvable items only, so the trailing success belongs to the last
    // library song, not the unresolved slot.
    XCTAssertEqual(
      mixedAddedCount(
        resolutions: [.librarySong, .unresolved, .nonLibraryTrack, .librarySong],
        outcomes: [true, false, true]
      ),
      2
    )
  }

  func testMixedAddedCountAllFail() {
    XCTAssertEqual(
      mixedAddedCount(
        resolutions: [.librarySong, .nonLibraryTrack],
        outcomes: [false, false]
      ),
      0
    )
  }
}
