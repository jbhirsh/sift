import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { SiftProvider } from '../../src/context/SiftContext';
import { useMusicProvider } from '../../src/hooks/useMusicProvider';

jest.mock('../../src/services/SessionStore');

const mockProvider: { previewOffset?: jest.Mock } = {};
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
});
