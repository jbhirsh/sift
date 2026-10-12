import ObjectiveC
import XCTest

/// Xcode's accessibility audit (#146) on each screen of the installed
/// e2e-simulator build (mock library). The Jest scan
/// (__tests__/helpers/a11yScan.ts) checks the props the app sets; this
/// checks what iOS actually renders: contrast, hit targets, clipped text,
/// Dynamic Type, element descriptions and traits.
///
/// Each issue is printed as an `A11Y-AUDIT|` line, and each screen audited
/// as an `A11Y-AUDITED|` line, which scripts/run-a11y-audit.sh turns into
/// annotations (and a list of screens that were never reached). Issues are
/// reported, not failed on, until the baseline is clean.
final class AccessibilityAuditTests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.jessicahirsh.sift")
  private var appearance: String {
    ProcessInfo.processInfo.environment["A11Y_APPEARANCE"] ?? "light"
  }

  override func setUp() {
    continueAfterFailure = false
    print("A11Y-NOTE|idle wait \(IdleWait.disable() ? "off" : "still on")")
  }

  /// One pass through the app, as a fresh install sees it (the runner
  /// reinstalls first): Setup, Sift, Settings, then Done.
  func testEveryScreen() throws {
    app.launch()
    waitFor("setup-brand")
    try audit("Setup")

    app.buttons["Start Sifting"].tap()
    waitFor("card-track-name")
    try audit("Sift")

    element("settings-button").tap()
    waitFor("check-connection-button")
    try audit("Settings")
    element("settings-done-button").tap()
    waitFor("card-track-name")

    app.buttons["Keep"].tap()
    waitFor("finish-button")
    element("finish-button").tap()
    waitFor("done-title")
    try audit("Done")
  }

  private func element(_ identifier: String) -> XCUIElement {
    app.descendants(matching: .any)[identifier].firstMatch
  }

  private func waitFor(_ identifier: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(element(identifier).waitForExistence(timeout: 30), "\(identifier) never appeared", file: file, line: line)
    // Let entrance animations finish: a mid-fade element reads as low contrast.
    Thread.sleep(forTimeInterval: 1.5)
  }

  private func audit(_ screen: String) throws {
    try app.performAccessibilityAudit(for: .all) { issue in
      let element = issue.element
      let who = [element?.identifier, element?.label]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: " / ")
      let fields = [
        "A11Y-AUDIT",
        screen,
        self.appearance,
        Self.name(of: issue.auditType),
        issue.compactDescription,
        who.isEmpty ? "(no element)" : who,
      ]
      print(fields.map { $0.replacingOccurrences(of: "|", with: "/") }.joined(separator: "|"))
      return true
    }
    print("A11Y-AUDITED|\(screen)|\(appearance)")
  }

  private static func name(of type: XCUIAccessibilityAuditType) -> String {
    let names: [(XCUIAccessibilityAuditType, String)] = [
      (.contrast, "contrast"),
      (.elementDetection, "elementDetection"),
      (.hitRegion, "hitRegion"),
      (.sufficientElementDescription, "sufficientElementDescription"),
      (.dynamicType, "dynamicType"),
      (.textClipped, "textClipped"),
      (.trait, "trait"),
    ]
    let matched = names.filter { type.contains($0.0) }.map(\.1)
    return matched.isEmpty ? "other(\(type.rawValue))" : matched.joined(separator: "+")
  }
}

/// XCUITest waits for the app to go idle before and after every action, up
/// to a minute each. Sift never reads as idle on its Sift screen, even with
/// playback paused, so each tap cost two minutes and the pass outran the
/// step's time limit. The waits here are explicit (waitFor), as Maestro's
/// are, so XCUITest's are switched off. Private API, in this test bundle
/// only: if it's renamed, the waits come back and the run is just slow.
private enum IdleWait {
  static func disable() -> Bool {
    guard let process = NSClassFromString("XCUIApplicationProcess") else { return false }
    var disabled = false
    let skipOne: @convention(block) (AnyObject, Bool) -> Void = { _, _ in }
    if let method = class_getInstanceMethod(
      process, NSSelectorFromString("waitForQuiescenceIncludingAnimationsIdle:")) {
      method_setImplementation(method, imp_implementationWithBlock(unsafeBitCast(skipOne, to: AnyObject.self)))
      disabled = true
    }
    let skipTwo: @convention(block) (AnyObject, Bool, Bool) -> Void = { _, _, _ in }
    if let method = class_getInstanceMethod(
      process, NSSelectorFromString("waitForQuiescenceIncludingAnimationsIdle:isPreEvent:")) {
      method_setImplementation(method, imp_implementationWithBlock(unsafeBitCast(skipTwo, to: AnyObject.self)))
      disabled = true
    }
    return disabled
  }
}
