import { Paths } from 'expo-file-system';
import { tracing } from './trace';
import covers from './mockCovers.json';

/**
 * The mock library's album covers (MockMusicProvider): a track's artworkURL
 * is `mock-cover:<slug>`, and this says what to show for it.
 *
 * - The E2E build (`tracing`) shows the cover CI put into the app
 *   (scripts/fetch-mock-covers.ts downloads it, scripts/apply-js-bundle.sh
 *   copies it in), a file in the app bundle, so no flow waits on the network.
 * - Dev, Expo Go and the web show the same cover from Apple's artwork server.
 *
 * mockCovers.json is the list both this and the fetch script read.
 */
const PREFIX = 'mock-cover:';

const pathBySlug = new Map(covers.map((cover) => [cover.slug, cover.path]));

/** A track's artworkURL for a mock cover. */
export const mockCoverURL = (slug: string) => `${PREFIX}${slug}`;

/**
 * What `expo-image` should load for `url`. Anything but a `mock-cover:` URL
 * comes back unchanged, and so does one naming a slug the list doesn't have
 * (a saved session's artworkURL is stored data): never a path outside
 * `mock-covers/`.
 */
export function mockCoverSource(url: string): string {
  if (!url.startsWith(PREFIX)) return url;
  const slug = url.slice(PREFIX.length);
  const coverPath = pathBySlug.get(slug);
  if (coverPath === undefined) return url;
  if (tracing) return `${Paths.bundle.uri.replace(/\/+$/, '')}/mock-covers/${slug}.jpg`;
  // The same URL as scripts/fetch-mock-covers.ts downloads.
  return `https://is1-ssl.mzstatic.com/image/thumb/${coverPath}/1000x1000bb.jpg`;
}
