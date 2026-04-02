import AVFoundation

// MARK: - PreviewAudioPlayer

@MainActor
final class PreviewAudioPlayer {
    private var player: AVPlayer?
    private(set) var isPlaying: Bool = false

    func play(url: URL, at position: Double = 0) {
        let item = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: item)
        if position > 0 {
            player?.seek(to: CMTime(seconds: position, preferredTimescale: 600))
        }
        player?.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func resume() {
        player?.play()
        isPlaying = true
    }

    func seek(to position: Double) {
        player?.seek(to: CMTime(seconds: position, preferredTimescale: 600))
    }

    var currentPosition: Double {
        player?.currentTime().seconds ?? 0
    }

    func stop() {
        player?.pause()
        player = nil
        isPlaying = false
    }
}
