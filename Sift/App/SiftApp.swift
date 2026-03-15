import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    // Retained for the UI-test window lifetime.
    private var uiTestWindow: NSWindow?
    private var uiTestViewModel: SiftViewModel?

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Set activation policy before SwiftUI builds its scene graph.
        NSApp.setActivationPolicy(.regular)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if SiftViewModel.isUITesting {
            // On macOS 26, testmanagerd spawns the app without activating it, so
            // SwiftUI's WindowGroup never fires its window-creation path. Bypass
            // this by building the window manually via NSHostingController, which
            // doesn't depend on the activation-driven scene lifecycle.
            createUITestWindow()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    private func createUITestWindow() {
        let viewModel = SiftViewModel()
        uiTestViewModel = viewModel

        let content = ContentView().environmentObject(viewModel)
        let controller = NSHostingController(rootView: content)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 700),
            styleMask: [.titled, .closable, .miniaturizable, .resizable,
                        .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.contentViewController = controller
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        uiTestWindow = window
    }
}

@main
struct SiftApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var viewModel = SiftViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .frame(minWidth: 600, minHeight: 500)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }

        Settings {
            SettingsView()
                .environmentObject(viewModel)
        }
    }
}
