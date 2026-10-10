import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Switch,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import GlassCard from '../components/GlassCard';
import { COLORS, RADIUS, SPACING } from '../theme';
import { PROVIDER_DISPLAY } from '../types';

const PROVIDER_SYMBOLS: Record<string, string> = {
  'apple-music': 'music.note.list',
};

interface SettingsScreenProps {
  onClose?: () => void;
}

export default function SettingsScreen({ onClose }: SettingsScreenProps) {
  const { state, dispatch, setStartAtChorus } = useSift();
  const { colors } = useTheme();
  const { authorize, isAuthorized } = useMusicProvider();

  const handleCheckConnection = useCallback(async () => {
    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'checking' });
    // Only open the provider's consent flow when we're not already authorized,
    // mirroring the load paths — checking an existing connection must never
    // re-prompt.
    if (await isAuthorized()) {
      dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
      return;
    }
    await authorize();
  }, [dispatch, isAuthorized, authorize]);

  const connectionLabelText = (() => {
    switch (state.connectionStatus) {
      case 'unknown':
        return 'Not checked';
      case 'checking':
        return 'Checking\u2026';
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Not connected';
    }
  })();

  const connectionLabelColor = (() => {
    switch (state.connectionStatus) {
      case 'unknown':
      case 'checking':
        return colors.textSecondary;
      case 'connected':
        return colors.keepText;
      case 'disconnected':
        return colors.removeText;
    }
  })();

  const renderConnectionIndicator = () => {
    switch (state.connectionStatus) {
      case 'unknown':
        return (
          <View testID="connection-status-indicator">
            <SymbolView name="questionmark.circle" size={28} tintColor={colors.textSecondary} />
          </View>
        );
      case 'checking':
        return (
          <View testID="connection-status-indicator">
            <ActivityIndicator size="small" />
          </View>
        );
      case 'connected':
        return (
          <View testID="connection-status-indicator">
            <SymbolView name="checkmark.circle.fill" size={28} tintColor={COLORS.keep} />
          </View>
        );
      case 'disconnected':
        return (
          <View testID="connection-status-indicator">
            <SymbolView name="xmark.circle.fill" size={28} tintColor={COLORS.remove} />
          </View>
        );
    }
  };

  return (
    // The sheet's own background: a pageSheet Modal is white unless its
    // content paints one, which left white-on-white text in dark mode.
    // surface, iOS's raised sheet color, keeps the sheet's edge visible
    // against the black screen behind it and the cards visible on it.
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Settings
        </Text>
        <Text style={[styles.headerVersion, { color: colors.textSecondary }]}>
          Version 1.0.0
        </Text>
        {onClose && (
          <TouchableOpacity
            testID="settings-done-button"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.doneButton}
            hitSlop={8}
          >
            <Text style={[styles.doneButtonText, { color: colors.accent }]}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Connection status card */}
      <GlassCard intensity="regular" radius={RADIUS.md}>
        <View style={styles.cardContent}>
          <View style={styles.providerRow}>
            <SymbolView
              name={(PROVIDER_SYMBOLS[state.provider] || 'music.note.list') as SFSymbol}
              size={28}
              tintColor={colors.text}
              style={styles.providerIcon}
            />
            <View style={styles.providerInfo}>
              <Text style={[styles.providerName, { color: colors.text }]}>
                {PROVIDER_DISPLAY[state.provider]}
              </Text>
              <Text
                testID="connection-status-label"
                style={[styles.connectionLabel, { color: connectionLabelColor }]}
              >
                {connectionLabelText}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {renderConnectionIndicator()}
          </View>

          <GlassCard intensity="thin" radius={RADIUS.sm}>
            <TouchableOpacity
              testID="check-connection-button"
              style={[
                styles.checkButton,
                state.connectionStatus === 'checking' && { opacity: 0.5 },
              ]}
              onPress={handleCheckConnection}
              disabled={state.connectionStatus === 'checking'}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SymbolView name="arrow.clockwise" size={16} tintColor={colors.accent} />
                <Text style={[styles.checkButtonText, { color: colors.accent }]}>
                  Check Connection
                </Text>
              </View>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </GlassCard>

      {/* Playback settings. Apple Music only: starting at the chorus needs
          full-track playback. */}
      {state.provider === 'apple-music' && (
        <View style={styles.section}>
          <GlassCard intensity="regular" radius={RADIUS.md}>
            <View style={styles.settingRow}>
              <SymbolView
                name="music.mic"
                size={22}
                tintColor={colors.text}
              />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>
                  Start at chorus
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  Begin each song at its chorus instead of the start. Finds it
                  with timed lyrics from LRCLIB and Shazam's song matching.
                </Text>
              </View>
              <Switch
                testID="start-at-chorus-switch"
                accessibilityLabel="Start at chorus"
                value={state.startAtChorus}
                onValueChange={setStartAtChorus}
                trackColor={{ true: colors.accent, false: colors.quaternary }}
              />
            </View>
          </GlassCard>
        </View>
      )}

      <View style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING['2xl'],
  },
  header: {
    alignItems: 'center',
    gap: 4,
    paddingTop: SPACING['2xl'],
    marginBottom: SPACING['2xl'],
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerVersion: {
    fontSize: 12,
  },
  doneButton: {
    position: 'absolute',
    right: 0,
    top: SPACING['2xl'],
  },
  doneButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardContent: {
    padding: 16,
    gap: 12,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerIcon: {
    marginRight: 12,
  },
  providerInfo: {
    gap: 2,
  },
  providerName: {
    fontSize: 17,
    fontWeight: '600',
  },
  connectionLabel: {
    fontSize: 12,
  },
  checkButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  checkButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  section: {
    marginTop: SPACING.xl,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  settingText: {
    flex: 1,
    gap: SPACING.xs,
  },
  settingTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 12,
  },
});
