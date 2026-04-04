import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import GlassCard from '../components/GlassCard';
import { RADIUS, SPACING } from '../theme';
import { PROVIDER_DISPLAY } from '../types';

const PROVIDER_SYMBOLS: Record<string, string> = {
  'apple-music': 'music.note.list',
  spotify: 'music.note',
};

interface SettingsScreenProps {
  onClose?: () => void;
}

export default function SettingsScreen({ onClose: _onClose }: SettingsScreenProps) {
  const { state, dispatch } = useSift();
  const { colors } = useTheme();

  const handleCheckConnection = useCallback(() => {
    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'checking' });
    setTimeout(() => {
      dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
    }, 1500);
  }, [dispatch]);

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
        return '#34C759';
      case 'disconnected':
        return '#FF3B30';
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
            <SymbolView name="checkmark.circle.fill" size={28} tintColor="#34C759" />
          </View>
        );
      case 'disconnected':
        return (
          <View testID="connection-status-indicator">
            <SymbolView name="xmark.circle.fill" size={28} tintColor="#FF3B30" />
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Settings
        </Text>
        <Text style={[styles.headerVersion, { color: colors.textSecondary }]}>
          Version 1.0.0
        </Text>
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
});
