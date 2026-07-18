import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import ResumeSessionModal from '../../src/components/ResumeSessionModal';
import { SiftSession } from '../../src/types';

jest.mock('expo-symbols', () => ({
  SymbolView: 'SymbolView',
}));

jest.mock('../../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      text: '#000',
      textSecondary: '#666',
      accent: '#007AFF',
    },
  }),
}));

jest.mock('../../src/components/GlassCard', () => {
  const { View } = require('react-native');
  return function MockGlassCard({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) {
    return <View {...props}>{children}</View>;
  };
});

const session: SiftSession = {
  tracks: [
    { id: '1', name: 'A', artist: 'A', album: 'A', duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00Z' },
    { id: '2', name: 'B', artist: 'B', album: 'B', duration: 180, playCount: 5, dateAdded: '2020-02-01T00:00:00Z' },
    { id: '3', name: 'C', artist: 'C', album: 'C', duration: 240, playCount: 3, dateAdded: '2020-03-01T00:00:00Z' },
    { id: '4', name: 'D', artist: 'D', album: 'D', duration: 190, playCount: 8, dateAdded: '2020-04-01T00:00:00Z' },
    { id: '5', name: 'E', artist: 'E', album: 'E', duration: 210, playCount: 1, dateAdded: '2020-05-01T00:00:00Z' },
  ],
  cursor: 3,
  kept: [
    { id: '1', name: 'A', artist: 'A', album: 'A', duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00Z' },
  ],
  removed: [
    { id: '2', name: 'B', artist: 'B', album: 'B', duration: 180, playCount: 5, dateAdded: '2020-02-01T00:00:00Z' },
  ],
  skipped: [
    { id: '3', name: 'C', artist: 'C', album: 'C', duration: 240, playCount: 3, dateAdded: '2020-03-01T00:00:00Z' },
  ],
  sortOrder: 'least-played',
  savedAt: '2026-04-09T12:00:00Z',
  provider: 'apple-music',
  source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
};

describe('ResumeSessionModal', () => {
  const onResume = jest.fn();
  const onStartOver = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('renders session stats correctly', () => {
    const { getByTestId } = render(
      <ResumeSessionModal
        session={session}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );

    expect(getByTestId('resume-stat-kept')).toBeTruthy();
    expect(getByTestId('resume-stat-removed')).toBeTruthy();
    expect(getByTestId('resume-stat-skipped')).toBeTruthy();
    expect(getByTestId('resume-stat-remaining')).toBeTruthy();
  });

  test('clamps a corrupted cursor: remaining never goes negative', () => {
    // cursor beyond tracks.length (corrupted/legacy session) must show 0,
    // mirroring the reducer's own Math.max(0, ...) clamp.
    const corrupted = { ...session, cursor: 7 };
    const { getByTestId } = render(
      <ResumeSessionModal
        session={corrupted}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );
    const { getByText } = within(getByTestId('resume-stat-remaining'));
    expect(getByText('0')).toBeTruthy();
  });

  test('a finished session reads as unsaved changes, not an unfinished sift', () => {
    // Finished sessions reach this modal only when buffered keeps still
    // need saving (see SetupScreen) — the copy must not claim otherwise.
    const finished = { ...session, cursor: session.tracks.length };
    const { getByText, queryByText } = render(
      <ResumeSessionModal
        session={finished}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );
    expect(getByText(/unsaved changes from a finished sift/)).toBeTruthy();
    expect(queryByText(/unfinished sift/)).toBeNull();
  });

  test('an unfinished session keeps the unfinished-sift copy', () => {
    const { getByText } = render(
      <ResumeSessionModal
        session={session}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );
    expect(getByText(/You have an unfinished sift for/)).toBeTruthy();
  });

  test('displays playlist name in description', () => {
    const { getByText } = render(
      <ResumeSessionModal
        session={session}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );

    expect(getByText(/My Playlist/)).toBeTruthy();
  });

  test('displays Library for library source', () => {
    const librarySession = { ...session, source: { type: 'library' as const } };
    const { getByText } = render(
      <ResumeSessionModal
        session={librarySession}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );

    expect(getByText(/Library/)).toBeTruthy();
  });

  test('calls onResume when Resume is pressed', () => {
    const { getByTestId } = render(
      <ResumeSessionModal
        session={session}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );

    fireEvent.press(getByTestId('resume-modal-resume'));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  test('calls onStartOver when Start Over is pressed', () => {
    const { getByTestId } = render(
      <ResumeSessionModal
        session={session}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );

    fireEvent.press(getByTestId('resume-modal-start-over'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  test('calls onCancel when Cancel is pressed', () => {
    const { getByTestId } = render(
      <ResumeSessionModal
        session={session}
        onResume={onResume}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />,
    );

    fireEvent.press(getByTestId('resume-modal-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
