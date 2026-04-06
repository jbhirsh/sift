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
import GlassCard from './GlassCard';
import { formatTime } from '../utils/formatTime';
import { RADIUS } from '../theme';

export default function PlayerControls() {
  const { state, currentTrack } = useSift();
  const { colors } = useTheme();
  const { play, pause, togglePlayPause, seek, skipBackward, skipForward } = useMusicProvider();

  // Auto-play current track on mount and when cursor advances
  const prevTrackIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (currentTrack && currentTrack.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = currentTrack.id;
      play(currentTrack.id);
    }
  }, [currentTrack, play]);

  // Pause music when PlayerControls unmounts (session paused/done)
  useEffect(() => {
    return () => { pause(); };
  }, [pause]);

  const duration = currentTrack?.duration ?? 0;
  const maxDuration = Math.max(duration, 1);
  const sliderWidth = useSharedValue(0);

  const onSliderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      sliderWidth.value = e.nativeEvent.layout.width;
    },
    [sliderWidth],
  );

  const handlePlayPause = useCallback(() => {
    if (!state.isPlaying && currentTrack && state.playbackPosition === 0) {
      play(currentTrack.id);
    } else {
      togglePlayPause();
    }
  }, [state.isPlaying, state.playbackPosition, currentTrack, play, togglePlayPause]);

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
            <Text style={[styles.timeText, { color: colors.textTertiary }]} testID="elapsed-time">
              {formatTime(state.playbackPosition)}
            </Text>

            <GestureDetector gesture={composed}>
              <View style={styles.sliderContainer} onLayout={onSliderLayout}>
                <View style={[styles.sliderTrack, { backgroundColor: colors.quaternary }]}>
                  <Animated.View style={[styles.sliderFill, { backgroundColor: colors.accent }, fillStyle]} />
                </View>
                <Animated.View style={[styles.sliderThumb, thumbStyle]} />
              </View>
            </GestureDetector>

            <Text style={[styles.timeText, { color: colors.textTertiary }]} testID="duration-time">
              {formatTime(duration)}
            </Text>
          </View>
        )}

        {/* Playback controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={skipBackward} style={styles.secondaryButton}>
            <SymbolView name="gobackward.15" size={20} tintColor={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handlePlayPause}
            style={styles.playButton}
            testID="play-pause-button"
          >
            <SymbolView name={state.isPlaying ? 'pause.fill' : 'play.fill'} size={28} tintColor={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity onPress={skipForward} style={styles.secondaryButton}>
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
