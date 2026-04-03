import SwiftUI

// MARK: - Interactive front card with artwork hero

struct InteractiveCardView: View {
    @EnvironmentObject var vm: SiftViewModel
    let track: Track
    var programmaticOffset: CGFloat = 0

    @GestureState private var dragOffset: CGSize = .zero

    private var dragThreshold: Double { 80 }

    private var effectiveOffset: CGFloat {
        dragOffset.width + programmaticOffset
    }

    private var overlayOpacity: Double {
        min(abs(effectiveOffset) / dragThreshold, 1.0)
    }

    var body: some View {
        ZStack {
            // Main card
            VStack(spacing: 0) {
                // Artwork hero
                ZStack(alignment: .bottomLeading) {
                    if let url = track.artworkURL {
                        AsyncImage(url: url) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Rectangle()
                                .fill(Color(.quaternarySystemFill))
                                .overlay(
                                    ProgressView()
                                )
                        }
                        .clipped()
                    } else {
                        Rectangle()
                            .fill(Color(.quaternarySystemFill))
                            .overlay(
                                Image(systemName: "music.note")
                                    .font(.system(size: 48))
                                    .foregroundStyle(.secondary)
                            )
                    }

                    // Gradient overlay with track info
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.5)],
                        startPoint: .center,
                        endPoint: .bottom
                    )

                    VStack(alignment: .leading, spacing: 4) {
                        Text(track.name)
                            .font(.title2.bold())
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                            .accessibilityIdentifier("card-track-name")
                        Text(track.artist)
                            .font(.callout.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .accessibilityIdentifier("card-artist-name")
                    }
                    .padding(20)
                    .environment(\.colorScheme, .dark)
                }
                .frame(maxWidth: .infinity)
                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                .clipped()

                // Card footer
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ALBUM")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                            .tracking(1)
                        Text(track.album)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .accessibilityIdentifier("card-album-name")
                    }
                    Spacer()
                    HStack(spacing: 4) {
                        Image(systemName: "play.fill")
                            .font(.caption2)
                        Text("\(track.playCount) plays")
                            .font(.caption)
                            .accessibilityIdentifier("card-play-count")
                    }
                    .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.08), radius: 20, y: 8)

            // Swipe overlays
            if effectiveOffset > 0 {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.green.opacity(0.15 * overlayOpacity))
                    .overlay(
                        Text("KEEP")
                            .font(.headline.bold())
                            .foregroundStyle(.green)
                            .opacity(overlayOpacity),
                        alignment: .topLeading
                    )
                    .padding(16)
            } else if effectiveOffset < 0 {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.red.opacity(0.15 * overlayOpacity))
                    .overlay(
                        Text("REMOVE")
                            .font(.headline.bold())
                            .foregroundStyle(.red)
                            .opacity(overlayOpacity),
                        alignment: .topTrailing
                    )
                    .padding(16)
            }
        }
        .offset(x: effectiveOffset, y: dragOffset.height * 0.2)
        .rotationEffect(.degrees(effectiveOffset / 20))
        .gesture(
            DragGesture(minimumDistance: 10)
                .updating($dragOffset) { value, state, _ in
                    state = value.translation
                }
                .onEnded { value in
                    let dragX = value.translation.width
                    if dragX > dragThreshold {
                        vm.decide(.keep)
                    } else if dragX < -dragThreshold {
                        vm.decide(.remove)
                    }
                }
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: dragOffset)
        .animation(.easeIn(duration: 0.3), value: programmaticOffset)
    }
}
