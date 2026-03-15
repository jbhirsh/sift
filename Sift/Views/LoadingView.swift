import SwiftUI

struct LoadingView: View {
    @EnvironmentObject var vm: SiftViewModel

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("sift.")
                .font(.system(size: 36, weight: .bold, design: .rounded))

            VStack(spacing: 12) {
                ProgressView(value: vm.loadProgress)
                    .progressViewStyle(.linear)
                    .frame(width: 300)

                Text(vm.loadMessage)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .animation(.default, value: vm.loadMessage)
            }

            Spacer()
        }
    }
}
