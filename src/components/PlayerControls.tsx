import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import { useChorusStart } from '../hooks/useChorusStart';
import GlassCard from './GlassCard';
import { formatTime } from '../utils/formatTime';
import { RADIUS } from '../theme';
import { Track } from '../types';

export default function PlayerControls() {
  const { state, currentTrack } = useSift();
  const { colors } = useTheme();
  const { play, pause, stop, togglePlayPause, seek, skipBackward, skipForward, previewOffset } =
    useMusicProvider();
  const { enabled: chorusEnabled, startPositionFor } = useChorusStart(previewOffset);

  const prevTrackIdRef = useRef<string | undefined>(undefined);
  // The track whose chorus start is being resolved, so a play tap meanwhile
  // doesn't start it a second time.
  const pendingStartRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // Read when a pending start lands: the setting may have been turned off
  // while the chorus was resolving.
  const chorusEnabledRef = useRef(chorusEnabled);
  useEffect(() => {
    chorusEnabledRef.current = chorusEnabled;
  }, [chorusEnabled]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Play a track from its start: 0:00, or its chorus with "Start at chorus".
  const playFromStart = useCallback(
    (track: Track) => {
      if (!chorusEnabled) {
        play(track.id);
        return;
      }
      // Silence the previous card's song while this one's chorus resolves
      // (instant when prefetched, at most CHORUS_WAIT_MS otherwise). Play
      // only once the stop has landed too: a pause or position reset that
      // finished after play() would pause or rewind the new song.
      pendingStartRef.current = track.id;
      void Promise.all([stop(), startPositionFor(track)]).then(([, position]) => {
        if (pendingStartRef.current === track.id) pendingStartRef.current = null;
        // The card may have been swiped away, or the player closed, while
        // the chorus was resolving.
        if (!mountedRef.current || prevTrackIdRef.current !== track.id) return;
        if (chorusEnabledRef.current) play(track.id, position);
        else play(track.id);
      });
    },
    [chorusEnabled, play, stop, startPositionFor],
  );

  // Auto-play current track on mount and when cursor advances
  useEffect(() => {
    if (currentTrack && currentTrack.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = currentTrack.id;
      playFromStart(currentTrack);
    }
  }, [currentTrack, playFromStart]);

  // Pause music when PlayerControls unmounts (session paused/done)
  useEffect(() => {
    return () => { pause(); };
  }, [pause]);

  const duration = currentTrack?.duration ?? 0;
  const maxDuration = Math.max(duration, 1);
  const sliderWidth = useSharedValue(0);

  const onSliderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      // .set() rather than a .value write: the React Compiler rules treat a
      // hook's return value as immutable outside worklets.
      sliderWidth.set(e.nativeEvent.layout.width);
    },
    [sliderWidth],
  );

  const handlePlayPause = useCallback(() => {
    // Position 0 while stopped: this track never started (auto-play
    // failed), so start it, rather than resume nothing.
    if (!state.isPlaying && currentTrack && state.playbackPosition === 0) {
      // Already starting (its chorus is resolving): don't start it twice.
      if (pendingStartRef.current === currentTrack.id) return;
      playFromStart(currentTrack);
    } else {
      togglePlayPause();
    }
  }, [state.isPlaying, state.playbackPosition, currentTrack, playFromStart, togglePlayPause]);

  const seekTo = useCallback(
    (value: number) => {
      seek(value);
    },
    [seek],
  );

  const tapGesture = Gesture.Tap().onEnd((event) => {
    if (sliderWidth.value <= 0) return;
    const ratio = Math.max(0, Math.min(1, event.x / sliderWidth.value));
    const position = ratio * maxDuration;
    runOnJS(seekTo)(position);
  });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (sliderWidth.value <= 0) return;
      const ratio = Math.max(0, Math.min(1, event.x / sliderWidth.value));
      const position = ratio * maxDuration;
      runOnJS(seekTo)(position);
    });

  const composed = Gesture.Race(panGesture, tapGesture);

  const fraction = maxDuration > 0 ? state.playbackPosition / maxDuration : 0;

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, fraction * 100))}%` as `${number}%`,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${Math.max(0, Math.min(100, fraction * 100))}%` as `${number}%`,
  }));

  return (
    <GlassCard intensity="regular" radius={RADIUS.lg}>
      <View style={styles.container}>
        {/* Seek bar */}
        {currentTrack != null && (
          <View style={styles.seekRow}>
            <Text style={[styles.timeText, { color: colors.textSecondary }]} testID="elapsed-time">
              {formatTime(state.playbackPosition)}
            </Text>

            <GestureDetector gesture={composed}>
              <View style={styles.sliderContainer} onLayout={onSliderLayout}>
                <View style={[styles.sliderTrack, { backgroundColor: colors.textTertiary }]}>
                  <Animated.View style={[styles.sliderFill, { backgroundColor: colors.accent }, fillStyle]} />
                </View>
                <Animated.View style={[styles.sliderThumb, thumbStyle]} />
              </View>
            </GestureDetector>

            <Text style={[styles.timeText, { color: colors.textSecondary }]} testID="duration-time">
              {formatTime(duration)}
            </Text>
          </View>
        )}

        {/* Playback controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={skipBackward}
            style={styles.secondaryButton}
            accessibilityRole="button"
            accessibilityLabel="Back 15 seconds"
          >
            <SymbolView name="gobackward.15" size={20} tintColor={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handlePlayPause}
            style={styles.playButton}
            testID="play-pause-button"
          >
            <SymbolView name={state.isPlaying ? 'pause.fill' : 'play.fill'} size={28} tintColor={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={skipForward}
            style={styles.secondaryButton}
            accessibilityRole="button"
            accessibilityLabel="Forward 15 seconds"
          >
            <SymbolView name="goforward.15" size={20} tintColor={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  seekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 32,
    textAlign: 'center',
  },
  sliderContainer: {
    flex: 1,
    height: 30,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  sliderThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    marginLeft: -7,
    top: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
});
