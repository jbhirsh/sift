import SwiftUI

struct SiftView: View {
    @EnvironmentObject var vm: SiftViewModel
    @State private var swipeOffset: CGFloat = 0
    @State private var isAnimating = false

    private var progress: Double {
        guard vm.total > 0 else { return 0 }
        return Double(vm.cursor) / Double(vm.total)
    }

    private let segmentCount = 10

    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Header
            HStack {
                Button {
                    vm.stopSession()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.body.weight(.medium))
                        .foregroundStyle(.secondary)
                        .frame(width: 40, height: 40)
                        .background(.quaternary, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("stop-button")

                Spacer()

                Text("Sift")
                    .font(.title3.bold())

                Spacer()

                Text("\(vm.remaining) left")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("remaining-count")
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .accessibilityElement(children: .contain)

            // MARK: - Stats row (compact)
            HStack(spacing: 16) {
                stat(label: "kept", value: vm.kept.count, color: .green)
                stat(label: "removed", value: vm.removed.count, color: .red)
                stat(label: "skipped", value: vm.skipped.count, color: .orange)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 8)

            // MARK: - Progress segments
            HStack(spacing: 3) {
                ForEach(0..<segmentCount, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Double(i) / Double(segmentCount) < progress
                              ? Color.primary
                              : Color(.quaternarySystemFill))
                        .frame(height: 3)
                }
            }
            .padding(.horizontal, 48)
            .padding(.bottom, 16)

            // MARK: - Card stack
            ZStack {
                if vm.nextNextTrack != nil {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color(.systemBackground))
                        .shadow(color: .black.opacity(0.04), radius: 8, y: 4)
                        .scaleEffect(0.9)
                        .offset(y: 16)
                        .opacity(0.4)
                }
                if vm.nextTrack != nil {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color(.systemBackground))
                        .shadow(color: .black.opacity(0.06), radius: 8, y: 4)
                        .scaleEffect(0.95)
                        .offset(y: 8)
                        .opacity(0.6)
                }
                if let track = vm.currentTrack {
                    InteractiveCardView(track: track, programmaticOffset: swipeOffset)
                }
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // MARK: - Player controls (minimal)
            PlayerControlsView()
                .padding(.horizontal, 24)
                .padding(.vertical, 8)

            // MARK: - Action buttons
            HStack(spacing: 40) {
                actionButton(
                    icon: "xmark",
                    label: "Remove",
                    color: .red
                ) { animateDecision(.remove) }

                actionButton(
                    icon: "arrow.right",
                    label: "Skip",
                    color: .orange
                ) { vm.decide(.skip) }

                actionButton(
                    icon: "checkmark",
                    label: "Keep",
                    color: .green
                ) { animateDecision(.keep) }
            }
            .disabled(isAnimating)
            .padding(.bottom, 32)
        }
        .onKeyPress(.leftArrow) { animateDecision(.keep); return .handled }
        .onKeyPress(.rightArrow) { animateDecision(.remove); return .handled }
        .onKeyPress("s") { vm.decide(.skip); return .handled }
        .onKeyPress(.space) { vm.togglePlayPause(); return .handled }
    }

    // MARK: - Animation

    private func animateDecision(_ decision: Decision) {
        guard !isAnimating else { return }
        isAnimating = true
        let direction: CGFloat = decision == .keep ? 500 : -500
        withAnimation(.easeIn(duration: 0.3)) {
            swipeOffset = direction
        } completion: {
            vm.decide(decision)
            swipeOffset = 0
            isAnimating = false
        }
    }

    // MARK: - Subviews

    private func stat(label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
                .accessibilityHidden(true)
            Text("\(value) \(label)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("stat-\(label)")
        }
    }

    private func actionButton(
        icon: String,
        label: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(color)
                    .frame(width: 64, height: 64)
                    .background(Color(.systemBackground), in: Circle())
                    .shadow(color: .black.opacity(0.06), radius: 8, y: 4)

                Text(label)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
