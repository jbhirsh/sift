import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { MusicProviderHost, useMusicProviderService } from '../../src/context/MusicProviderContext';

const mockPlayback = { position: 0, isPlaying: true };
const mockService = { getPlaybackState: jest.fn(() => ({ ...mockPlayback })) };

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockService),
}));

const seen: unknown[] = [];
function Probe() {
  const ref = useMusicProviderService();
  React.useEffect(() => {
    seen.push(ref.current);
  }, [ref]);
  return null;
}

describe('MusicProviderHost (#144)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPlayback.position = 0;
    mockPlayback.isPlaying = true;
  });
  afterEach(() => jest.useRealTimers());

  test('shares one provider and reports the playing position', async () => {
    const onPosition = jest.fn();
    seen.length = 0;
    await render(
      <MusicProviderHost provider="apple-music" isPlaying onPosition={onPosition}>
        <Probe />
        <Probe />
      </MusicProviderHost>,
    );
    expect(seen).toEqual([mockService, mockService]);
    const { createMusicProvider } = jest.requireMock('../../src/services');
    expect(createMusicProvider).toHaveBeenCalledTimes(1);

    mockPlayback.position = 12;
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(onPosition).toHaveBeenLastCalledWith(12);

    // A song that ended keeps its last position.
    mockPlayback.isPlaying = false;
    mockPlayback.position = 0;
    onPosition.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onPosition).not.toHaveBeenCalled();
  });

  test('polls only while playing', async () => {
    const onPosition = jest.fn();
    await render(
      <MusicProviderHost provider="apple-music" isPlaying={false} onPosition={onPosition}>
        <Text>idle</Text>
      </MusicProviderHost>,
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(onPosition).not.toHaveBeenCalled();
  });

  test('outside a SiftProvider the hook says so', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(<Probe />)).rejects.toThrow('within a SiftProvider');
    jest.restoreAllMocks();
  });
});
