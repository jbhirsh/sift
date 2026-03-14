import SwiftUI

struct SetupView: View {
    @EnvironmentObject var vm: CullViewModel

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Text("sift.")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                Text("Clean up your music library.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Sort by")
                    .font(.headline)

                Picker("Sort order", selection: $vm.sortOrder) {
                    ForEach(SortOrder.allCases, id: \.self) { order in
                        Text(order.displayName).tag(order)
                    }
                }
                .pickerStyle(.radioGroup)
            }
            .padding()
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))

            VStack(spacing: 12) {
                if vm.hasSavedSession {
                    Button("Resume Previous Session") {
                        vm.resumeSession()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }

                Button(vm.hasSavedSession ? "Start Fresh" : "Start Sifting") {
                    vm.startFresh()
                }
                .buttonStyle(vm.hasSavedSession ? .bordered : .borderedProminent)
                .controlSize(.large)
            }

            Spacer()
        }
        .padding(40)
        .frame(width: 480, height: 480)
    }
}
