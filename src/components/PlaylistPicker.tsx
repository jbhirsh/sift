import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { SPACING } from '../theme';
import BottomSheet, { SheetHeader } from './BottomSheet';
import { Playlist } from '../types';
import { useTraceScreen } from '../hooks/useTrace';

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
  useTraceScreen('playlist-picker');
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.quaternary }]}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
      testID={`playlist-row-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.trackCount} ${item.trackCount === 1 ? 'track' : 'tracks'}`}
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
    <BottomSheet testID="playlist-picker-modal" maxHeight="70%">
      <SheetHeader
        title="Choose a Playlist"
        actionLabel="Cancel"
        onAction={onCancel}
        actionTestID="playlist-picker-cancel"
      />

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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
