import SwiftUI

struct DoneView: View {
    @EnvironmentObject var vm: CullViewModel

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Text("All done.")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                Text("Your library has been sifted.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 40) {
                summaryItem(count: vm.kept.count, label: "kept", icon: "checkmark.circle.fill", color: .green)
                summaryItem(count: vm.removed.count, label: "removed", icon: "xmark.circle.fill", color: .red)
                summaryItem(count: vm.skipped.count, label: "skipped", icon: "arrow.right.circle.fill", color: .orange)
            }
            .padding()
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))

            Button("Start Over") {
                vm.startFresh()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer()
        }
        .padding(40)
        .frame(width: 480, height: 480)
    }

    private func summaryItem(count: Int, label: String, icon: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(color)
            Text("\(count)")
                .font(.title.bold())
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }
}
