import React, { useCallback } from 'react';
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
import { formatTime } from '../utils/formatTime';

export default function PlayerControls() {
  const { state, currentTrack, togglePlayPause, seek, skipBackward, skipForward } = useSift();

  const duration = currentTrack?.duration ?? 0;
  const maxDuration = Math.max(duration, 1);
  const sliderWidth = useSharedValue(0);

  const onSliderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      sliderWidth.value = e.nativeEvent.layout.width;
    },
    [sliderWidth],
  );

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
    <View style={styles.container}>
      {/* Seek bar */}
      {currentTrack != null && (
        <View style={styles.seekRow}>
          <Text style={styles.timeText} testID="elapsed-time">
            {formatTime(state.playbackPosition)}
          </Text>

          <GestureDetector gesture={composed}>
            <View style={styles.sliderContainer} onLayout={onSliderLayout}>
              <View style={styles.sliderTrack}>
                <Animated.View style={[styles.sliderFill, fillStyle]} />
              </View>
              <Animated.View style={[styles.sliderThumb, thumbStyle]} />
            </View>
          </GestureDetector>

          <Text style={styles.timeText} testID="duration-time">
            {formatTime(duration)}
          </Text>
        </View>
      )}

      {/* Playback controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity onPress={skipBackward} style={styles.secondaryButton}>
          <SymbolView name="gobackward.15" size={20} tintColor="rgba(60,60,67,0.6)" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePlayPause}
          style={styles.playButton}
          testID="play-pause-button"
        >
          <SymbolView name={state.isPlaying ? 'pause.fill' : 'play.fill'} size={28} tintColor="#000" />
        </TouchableOpacity>

        <TouchableOpacity onPress={skipForward} style={styles.secondaryButton}>
          <SymbolView name="goforward.15" size={20} tintColor="rgba(60,60,67,0.6)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  seekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    color: 'rgba(60, 60, 67, 0.18)',
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
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    borderRadius: 1.5,
  },
  sliderThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    marginLeft: -7,
    top: 8,
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
  secondaryIcon: {
    fontSize: 16,
    color: 'rgba(60, 60, 67, 0.3)',
  },
  skipLabel: {
    fontSize: 9,
    color: 'rgba(60, 60, 67, 0.3)',
    marginTop: -2,
  },
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  playIcon: {
    fontSize: 20,
  },
});
