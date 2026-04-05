import * as Sentry from '@sentry/react-native';
import type { MusicProviderService } from './MusicProviderInterface';
import type { MusicProvider } from '../types';
import { MockMusicProvider } from './MockMusicProvider';
import { SpotifyProvider } from './SpotifyProvider';

/**
 * Factory that returns the appropriate MusicProviderService for the given
 * provider type.
 *
 * Returns SpotifyProvider for 'spotify' (preview playback via expo-audio).
 * For Apple Music, attempts to load the native MusicKit module and falls
 * back to MockMusicProvider if the native module is unavailable (e.g. Expo Go).
 */
export function createMusicProvider(provider: MusicProvider): MusicProviderService {
  switch (provider) {
    case 'spotify':
      return new SpotifyProvider();
    case 'apple-music':
    default:
      try {
        // AppleMusicProvider loads the native MusicKit module and throws
        // if it's unavailable (Expo Go, Android, web).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AppleMusicProvider } = require('./AppleMusicProvider');
        const instance = new AppleMusicProvider();
        Sentry.addBreadcrumb({
          category: 'music-provider',
          message: 'Loaded native AppleMusicProvider',
          level: 'info',
        });
        return instance;
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'music-provider',
          message: `Native AppleMusicProvider unavailable, using mock: ${err}`,
          level: 'warning',
        });
        return new MockMusicProvider();
      }
  }
}

export type { MusicProviderService };
