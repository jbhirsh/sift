import SwiftUI

struct ContentView: View {
    @EnvironmentObject var vm: CullViewModel

    var body: some View {
        Group {
            switch vm.phase {
            case .setup:
                SetupView()
            case .loading:
                LoadingView()
            case .culling:
                CullView()
            case .done:
                DoneView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: vm.phase)
    }
}
