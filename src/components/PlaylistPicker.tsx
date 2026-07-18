import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { SPACING, RADIUS } from '../theme';
import GlassCard from './GlassCard';
import { Playlist } from '../types';

interface PlaylistPickerProps {
  playlists: Playlist[];
  loading: boolean;
  onSelect: (playlist: Playlist) => void;
  onCancel: () => void;
}

export default function PlaylistPicker({
  playlists,
  loading,
  onSelect,
  onCancel,
}: PlaylistPickerProps) {
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.quaternary }]}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
      testID={`playlist-row-${item.id}`}
    >
      <Text style={[styles.playlistName, { color: colors.text }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.trackCount, { color: colors.textSecondary }]}>
        {item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible
      transparent
      animationType="slide"
    >
      <View style={styles.overlay} testID="playlist-picker-modal">
        <View style={styles.sheetContainer}>
          <GlassCard intensity="thick" radius={RADIUS.lg} style={styles.sheet}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                Choose a Playlist
              </Text>
              <TouchableOpacity onPress={onCancel} activeOpacity={0.7} testID="playlist-picker-cancel">
                <Text style={[styles.cancelText, { color: colors.accent }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.centered} testID="playlist-picker-loading">
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                  Loading playlists…
                </Text>
              </View>
            ) : playlists.length === 0 ? (
              <View style={styles.centered} testID="playlist-picker-empty">
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No playlists found
                </Text>
              </View>
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                style={styles.list}
                testID="playlist-picker-list"
              />
            )}
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    maxHeight: '70%',
  },
  sheet: {
    paddingBottom: SPACING['4xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 17,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playlistName: {
    fontSize: 17,
    flex: 1,
    marginRight: SPACING.lg,
  },
  trackCount: {
    fontSize: 15,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['4xl'],
    gap: SPACING.lg,
  },
  loadingText: {
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
  },
});
