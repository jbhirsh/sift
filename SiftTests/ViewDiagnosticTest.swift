import XCTest
import SwiftUI
@testable import Sift

@MainActor
final class ViewDiagnosticTest: XCTestCase {
    func testDumpSetupViewHierarchy() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let view = renderInWindow(SetupView().environmentObject(vm))

        var output = "=== VIEW HIERARCHY ===\n"
        dumpViewHierarchyToString(view, indent: 0, output: &output)
        output += "=== END ===\n"

        let scenes = UIApplication.shared.connectedScenes
        output += "Connected scenes count: \(scenes.count)\n"
        for scene in scenes {
            output += "Scene: \(scene), state: \(scene.activationState.rawValue)\n"
        }

        let path = NSTemporaryDirectory() + "view-hierarchy.txt"
        try? output.write(toFile: path, atomically: true, encoding: .utf8)
        // Use XCTFail to print the path so we can find the file
        XCTFail("Hierarchy written to: \(path)\n\(output)")
    }
}

private func dumpViewHierarchyToString(_ view: UIView, indent: Int, output: inout String) {
    let prefix = String(repeating: "  ", count: indent)
    let cls = String(describing: type(of: view))
    var info = "\(prefix)\(cls) frame=\(view.frame)"
    if let lbl = view.accessibilityLabel { info += " a11yLabel=\"\(lbl)\"" }
    if let ident = view.accessibilityIdentifier { info += " a11yId=\"\(ident)\"" }
    if let label = view as? UILabel { info += " text=\"\(label.text ?? "nil")\"" }
    let count = view.accessibilityElementCount()
    if count != NSNotFound && count > 0 {
        info += " a11yElements=\(count)"
        for i in 0..<count {
            if let el = view.accessibilityElement(at: i) {
                let obj = el as AnyObject
                let elCls = String(describing: type(of: el))
                var elInfo = "\(prefix)  [\(i)] \(elCls)"
                if let lbl = obj.accessibilityLabel ?? nil { elInfo += " label=\"\(lbl)\"" }
                if let ident = obj.accessibilityIdentifier ?? nil { elInfo += " id=\"\(ident)\"" }
                output += elInfo + "\n"
            }
        }
    }
    output += info + "\n"
    for sub in view.subviews {
        dumpViewHierarchyToString(sub, indent: indent + 1, output: &output)
    }
}
