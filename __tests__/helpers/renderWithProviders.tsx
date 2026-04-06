import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { SiftProvider } from '../../src/context/SiftContext';
import { Track } from '../../src/types';

// Shared mocks - import this file after setting up jest.mock calls
export const mockTrackA: Track = {
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
};

export const mockTrackB: Track = {
  id: '2', name: 'Track B', artist: 'Artist B', album: 'Album B',
  duration: 180, playCount: 20, dateAdded: '2021-06-15T00:00:00.000Z',
};

export const mockTrackC: Track = {
  id: '3', name: 'Track C', artist: 'Artist C', album: 'Album C',
  duration: 240, playCount: 5, dateAdded: '2019-03-10T00:00:00.000Z',
};

const mockSafeAreaInsets = {
  top: 0, bottom: 0, left: 0, right: 0,
};

export function renderWithProviders(
  ui: React.ReactElement,
  { initialTracks }: { initialTracks?: Track[] } = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={{ insets: mockSafeAreaInsets, frame: { x: 0, y: 0, width: 390, height: 844 } }}>
      <ThemeProvider>
        <SiftProvider initialTracks={initialTracks}>
          {ui}
        </SiftProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
