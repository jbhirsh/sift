import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSift } from '../context/SiftContext';
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryText = isDark ? '#8E8E93' : '#6C6C70';
  const cardBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';

  const handleCheckConnection = useCallback(() => {
    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'checking' });
    // Simulate connection check; real implementation would verify MusicKit/Spotify auth
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
        return secondaryText;
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
            <SymbolView name="questionmark.circle" size={28} tintColor={secondaryText} />
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
        <Text style={[styles.headerTitle, { color: textColor }]}>
          Settings
        </Text>
        <Text style={[styles.headerVersion, { color: secondaryText }]}>
          Version 1.0.0
        </Text>
      </View>

      {/* Connection status card */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={styles.providerRow}>
          <SymbolView
            name={(PROVIDER_SYMBOLS[state.provider] || 'music.note.list') as any}
            size={28}
            tintColor={textColor}
            style={styles.providerIcon}
          />
          <View style={styles.providerInfo}>
            <Text style={[styles.providerName, { color: textColor }]}>
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
            <SymbolView name="arrow.clockwise" size={16} tintColor="#007AFF" />
            <Text style={styles.checkButtonText}>Check Connection</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 24,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerVersion: {
    fontSize: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerIcon: {
    fontSize: 28,
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
  indicatorIcon: {
    fontSize: 28,
  },
  checkButton: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  checkButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '500',
  },
});
