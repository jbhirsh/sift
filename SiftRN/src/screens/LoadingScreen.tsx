import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useColorScheme,
} from 'react-native';
import { useSift } from '../context/SiftContext';

export default function LoadingScreen() {
  const { state } = useSift();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryText = isDark ? '#8E8E93' : '#6C6C70';
  const trackBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const progressFill = '#007AFF';

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }} />

      <Text
        testID="loading-brand"
        style={[styles.brandText, { color: textColor }]}
      >
        sift.
      </Text>

      <View style={styles.progressSection}>
        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: trackBg }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: progressFill,
                width: `${Math.min(state.loadProgress * 100, 100)}%`,
              },
            ]}
          />
        </View>

        <Text
          testID="loading-message"
          style={[styles.messageText, { color: secondaryText }]}
        >
          {state.loadMessage}
        </Text>
      </View>

      <View style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 36,
    fontWeight: '700',
    ...Platform.select({
      ios: { fontFamily: '.AppleSystemUIFontRounded-Bold' },
      default: {},
    }),
    marginBottom: 24,
  },
  progressSection: {
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    width: 300,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  messageText: {
    fontSize: 16,
  },
});
