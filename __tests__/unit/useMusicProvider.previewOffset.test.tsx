import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { useMusicProvider } from '../../src/hooks/useMusicProvider';

jest.mock('../../src/services/SessionStore');

const mockProvider: { previewOffset?: jest.Mock; pause: jest.Mock } = {
  pause: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <SiftProvider>{children}</SiftProvider>;

describe('useMusicProvider.previewOffset', () => {
  it("returns the provider's preview offset", async () => {
    mockProvider.previewOffset = jest.fn().mockResolvedValue(51.5);
    const { result } = await renderHook(() => useMusicProvider(), { wrapper });
    await expect(result.current.previewOffset('t1')).resolves.toBe(51.5);
    expect(mockProvider.previewOffset).toHaveBeenCalledWith('t1');
  });

  it('is null for providers without preview offsets, or without an answer', async () => {
    mockProvider.previewOffset = undefined;
    const { result } = await renderHook(() => useMusicProvider(), { wrapper });
    await expect(result.current.previewOffset('t1')).resolves.toBeNull();
    mockProvider.previewOffset = jest.fn().mockResolvedValue(null);
    await expect(result.current.previewOffset('t1')).resolves.toBeNull();
  });

  it('stop pauses and resets the position', async () => {
    const { result } = await renderHook(() => ({ provider: useMusicProvider(), sift: useSift() }), { wrapper });
    await act(async () => {
      result.current.sift.dispatch({ type: 'SET_PLAYBACK_POSITION', position: 33 });
      result.current.sift.dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
    });
    await act(async () => {
      await result.current.provider.stop();
    });
    expect(mockProvider.pause).toHaveBeenCalled();
    expect(result.current.sift.state.isPlaying).toBe(false);
    expect(result.current.sift.state.playbackPosition).toBe(0);
  });
});
