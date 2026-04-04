import type { MusicProviderService } from './MusicProviderInterface';
import type { MusicProvider } from '../types';
import { MockMusicProvider } from './MockMusicProvider';
import { SpotifyProvider } from './SpotifyProvider';

/**
 * Factory that returns the appropriate MusicProviderService for the given
 * provider type.
 *
 * Returns SpotifyProvider for 'spotify' (preview playback via expo-audio).
 * Apple Music still uses MockMusicProvider until the native MusicKit module
 * is linked via EAS Build.
 */
export function createMusicProvider(provider: MusicProvider): MusicProviderService {
  switch (provider) {
    case 'spotify':
      return new SpotifyProvider();
    case 'apple-music':
    default:
      // MockMusicProvider until native module is linked
      return new MockMusicProvider();
  }
}

export type { MusicProviderService };
