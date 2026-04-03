import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestSiftView

@MainActor
final class TestSiftView: XCTestCase {
    private func render(vm: SiftViewModel) -> UIView {
        let controller = UIHostingController(rootView: SiftView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        return controller.view
    }

    /// Checks whether the given accessibility element's label contains `text`.
    private func elementLabelContains(_ text: String, in object: Any) -> Bool {
        let lbl = (object as AnyObject).accessibilityLabel ?? nil
        return lbl?.contains(text) == true
    }

    /// Searches accessibility children of a non-UIView container element.
    private func searchContainerChildren(
        _ text: String,
        in obj: AnyObject
    ) -> Bool {
        guard obj.responds(to: #selector(NSObject.accessibilityElementCount))
        else { return false }
        let count = obj.accessibilityElementCount()
        guard count != NSNotFound, count > 0 else { return false }
        for i in 0..<count {
            guard obj.responds(to: #selector(NSObject.accessibilityElement(at:))),
                  let el = obj.accessibilityElement?(at: i)
            else { continue }
            if deepFind(label: text, in: el) { return true }
        }
        return false
    }

    /// Recursively searches the accessibility tree, including nested containers
    /// created by .accessibilityElement(children: .contain).
    private func deepFind(label text: String, in object: Any) -> Bool {
        if elementLabelContains(text, in: object) { return true }
        if let view = object as? UIView {
            let count = view.accessibilityElementCount()
            if count != NSNotFound, count > 0 {
                for i in 0..<count {
                    guard let el = view.accessibilityElement(at: i)
                    else { continue }
                    if deepFind(label: text, in: el) { return true }
                }
            }
            for sub in view.subviews where deepFind(label: text, in: sub) {
                return true
            }
        } else {
            return searchContainerChildren(text, in: object as AnyObject)
        }
        return false
    }

    func testHeaderShowsSiftTitle() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        let view = render(vm: vm)
        XCTAssertTrue(deepFind(label: "Sift", in: view),
                      "Header should show 'Sift' title")
    }

    func testRemainingCountPresent() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        let view = render(vm: vm)
        XCTAssertTrue(deepFind(label: "left", in: view),
                      "Remaining count label should be present")
    }

    func testStatLabelsPresent() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "0 kept", in: view),
                      "Kept stat should be present")
        XCTAssertTrue(findAccessibilityElement(label: "0 removed", in: view),
                      "Removed stat should be present")
        XCTAssertTrue(findAccessibilityElement(label: "0 skipped", in: view),
                      "Skipped stat should be present")
    }

    func testStopButtonPresent() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        let view = render(vm: vm)
        // SF Symbol "chevron.left" inside .contain container
        XCTAssertTrue(deepFind(label: "Back", in: view),
                      "Stop button should be present")
    }

    func testActionButtonsPresent() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Keep", in: view),
                      "Keep button should be present")
        XCTAssertTrue(findAccessibilityElement(label: "Skip", in: view),
                      "Skip button should be present")
        XCTAssertTrue(findAccessibilityElement(label: "Remove", in: view),
                      "Remove button should be present")
    }
}
