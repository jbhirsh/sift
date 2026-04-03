import UIKit

/// Searches the accessibility tree for an element whose label contains
/// the given text. On modern iOS, SwiftUI views don't create UIKit
/// subviews — they expose content through UIAccessibility instead.
func findAccessibilityElement(
    label text: String,
    in view: UIView
) -> Bool {
    let count = view.accessibilityElementCount()
    if count != NSNotFound && count > 0 {
        for i in 0..<count {
            guard let el = view.accessibilityElement(at: i)
            else { continue }
            let lbl = (el as AnyObject).accessibilityLabel ?? nil
            if let lbl, lbl.contains(text) {
                return true
            }
        }
    }
    if let lbl = view.accessibilityLabel, lbl.contains(text) {
        return true
    }
    for sub in view.subviews where findAccessibilityElement(
        label: text,
        in: sub
    ) {
        return true
    }
    return false
}

/// Checks that no accessibility element has a label containing text.
func accessibilityElementAbsent(
    label text: String,
    in view: UIView
) -> Bool {
    !findAccessibilityElement(label: text, in: view)
}
