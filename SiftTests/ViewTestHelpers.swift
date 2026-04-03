import SwiftUI
import UIKit

/// Renders a SwiftUI view into a UIView for testing.
@MainActor
func renderInWindow<V: SwiftUI.View>(_ view: V) -> UIView {
    let controller = UIHostingController(rootView: view)
    controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)

    let window: UIWindow
    if let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene }).first {
        window = UIWindow(windowScene: scene)
    } else {
        window = UIWindow(frame: controller.view.frame)
    }
    window.rootViewController = controller
    window.makeKeyAndVisible()
    controller.view.layoutIfNeeded()
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
    return controller.view
}

/// Checks whether an AnyObject has an accessibility label/value/identifier
/// containing the given text.
private func objectContainsText(_ text: String, in obj: AnyObject) -> Bool {
    if let lbl = obj.accessibilityLabel ?? nil, lbl.contains(text) { return true }
    if let val = obj.accessibilityValue ?? nil, val.contains(text) { return true }
    if let ident = obj.accessibilityIdentifier ?? nil, ident.contains(text) { return true }
    return false
}

/// Checks the accessibility elements exposed by a container.
private func searchAccessibilityElements(for text: String, in obj: AnyObject) -> Bool {
    guard obj.responds(to: #selector(NSObject.accessibilityElementCount)) else { return false }
    let count = obj.accessibilityElementCount()
    guard count != NSNotFound, count > 0 else { return false }
    for i in 0..<count {
        guard obj.responds(to: #selector(NSObject.accessibilityElement(at:))),
              let el = obj.accessibilityElement?(at: i) else { continue }
        if objectContainsText(text, in: el as AnyObject) { return true }
    }
    return false
}

/// Searches for text content in the view hierarchy via accessibility.
func findAccessibilityElement(label text: String, in view: UIView) -> Bool {
    if objectContainsText(text, in: view) { return true }
    if searchAccessibilityElements(for: text, in: view) { return true }
    if let label = view as? UILabel, let t = label.text, t.contains(text) { return true }
    for sub in view.subviews where findAccessibilityElement(label: text, in: sub) {
        return true
    }
    return false
}

/// Checks that no accessibility element has a label containing text.
func accessibilityElementAbsent(label text: String, in view: UIView) -> Bool {
    !findAccessibilityElement(label: text, in: view)
}

/// Debug helper: dumps the view hierarchy.
func dumpViewHierarchy(_ view: UIView, indent: Int = 0) {
    let prefix = String(repeating: "  ", count: indent)
    let cls = String(describing: type(of: view))
    var info = "\(prefix)\(cls) frame=\(view.frame)"
    if let lbl = view.accessibilityLabel { info += " a11yLabel=\"\(lbl)\"" }
    if let ident = view.accessibilityIdentifier { info += " a11yId=\"\(ident)\"" }
    if let label = view as? UILabel { info += " text=\"\(label.text ?? "nil")\"" }
    let count = view.accessibilityElementCount()
    if count != NSNotFound && count > 0 {
        info += " a11yElements=\(count)"
    }
    print(info)
    for sub in view.subviews {
        dumpViewHierarchy(sub, indent: indent + 1)
    }
}
