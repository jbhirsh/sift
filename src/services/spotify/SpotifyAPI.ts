import * as Sentry from '@sentry/react-native';
import { Playlist, Track } from '../../types';

// ---------------------------------------------------------------------------
// Spotify Web API response types
// ---------------------------------------------------------------------------

interface SpotifyImage {
  url: string;
  width?: number;
  height?: number;
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyAlbum {
  name: string;
  images: SpotifyImage[];
}

interface SpotifyTrackObject {
  /** null for local files, which the Web API can't save, remove or play. */
  id: string | null;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  preview_url: string | null;
}

interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrackObject | null;
}

interface SpotifyPlaylistItem {
  id: string;
  name: string;
  images: SpotifyImage[];
  tracks: { total: number };
}

interface SpotifyPlaylistTrackItem {
  added_at: string;
  track: SpotifyTrackObject | null;
}

interface SpotifyPage<T> {
  items: T[];
  next: string | null;
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.spotify.com';

// Pagination URLs must stay on the Web API: the bearer token goes with them.
// The trailing slash ends the authority, so look-alike hosts don't match.
const API_URL_PREFIX = `${BASE_URL}/`;

// Maximum number of track URIs per "add tracks to playlist" request
const ADD_TRACKS_BATCH_SIZE = 100;


// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build standard headers for an authenticated Spotify API request. */
function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Make a GET request to the Spotify Web API. Throws descriptive strings
 * for recoverable HTTP errors so callers can distinguish auth failures.
 */
async function apiGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: authHeaders(token) });

  if (response.status === 401) throw new Error('not_authenticated');
  if (response.status === 403) throw new Error('forbidden');
  if (!response.ok) {
    throw new Error(`spotify_api_error_${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Pick the largest image from a Spotify image array.
 * Falls back to the first image if widths aren't provided.
 */
function largestImageURL(images: SpotifyImage[]): string | undefined {
  if (images.length === 0) return undefined;
  const sorted = [...images].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  );
  return sorted[0].url;
}

/**
 * The page's `next` URL, or null on the last page. Throws rather than
 * following a URL off the Spotify API origin with the user's token.
 */
function nextPageURL(next: string | null): string | null {
  if (next === null) return null;
  if (!next.startsWith(API_URL_PREFIX)) {
    throw new Error('spotify_unexpected_next_url');
  }
  return next;
}

type IdentifiedTrackObject = SpotifyTrackObject & { id: string };

/** A track object the app can use: present, with a non-empty id. */
function hasId(t: SpotifyTrackObject | null): t is IdentifiedTrackObject {
  return t !== null && typeof t.id === 'string' && t.id !== '';
}

/**
 * Map a page of track items to Tracks, skipping null tracks and tracks with
 * no id (local files). A null id would collide as a React key, send
 * `spotify:track:null` on removal and key the removal history by null —
 * and local files can't be removed through the API anyway.
 */
function mapTrackItems(
  items: { added_at: string; track: SpotifyTrackObject | null }[],
  into: Track[],
): number {
  let skipped = 0;
  for (const item of items) {
    if (hasId(item.track)) {
      into.push(mapTrackObject(item.track, item.added_at));
    } else if (item.track !== null) {
      skipped += 1;
    }
  }
  return skipped;
}

function logSkippedTracks(skipped: number, from: string): void {
  if (skipped === 0) return;
  Sentry.addBreadcrumb({
    category: 'spotify-api',
    message: `Skipped ${skipped} ${skipped === 1 ? 'track' : 'tracks'} without an id (local files) from ${from}`,
    level: 'info',
  });
}

/** Map a Spotify track object and added_at date to the app's Track type. */
function mapTrackObject(t: IdentifiedTrackObject, addedAt: string): Track {
  return {
    id: t.id,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    album: t.album.name,
    duration: t.duration_ms / 1000,
    playCount: 0, // Spotify Web API does not expose play counts
    dateAdded: addedAt,
    artworkURL: largestImageURL(t.album.images),
    previewURL: t.preview_url ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the authenticated user's full Saved Tracks library.
 *
 * Paginates through `GET /v1/me/tracks` (50 items per page) until every
 * track has been retrieved, then maps to the app's Track type.
 */
export async function loadLibrary(token: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let skipped = 0;
  let url: string | null = `${BASE_URL}/v1/me/tracks?limit=50`;

  while (url) {
    const page: SpotifyPage<SpotifySavedTrack> = await apiGet(url, token);
    skipped += mapTrackItems(page.items, tracks);
    url = nextPageURL(page.next);
  }

  logSkippedTracks(skipped, 'the library');
  return tracks;
}

/**
 * Fetch the authenticated user's Spotify profile.
 */
export async function fetchUserProfile(
  token: string,
): Promise<{ id: string; display_name: string }> {
  const data = await apiGet<{ id: string; display_name: string }>(
    `${BASE_URL}/v1/me`,
    token,
  );
  return { id: data.id, display_name: data.display_name };
}

/**
 * Create a private Spotify playlist and populate it with the given tracks.
 *
 * 1. Fetches the current user's profile to get their user ID.
 * 2. Creates a new private playlist.
 * 3. Adds tracks in batches of 100 (Spotify API limit per request).
 */
export async function createPlaylist(
  token: string,
  name: string,
  trackIDs: string[],
): Promise<void> {
  // 1. Get user ID
  const user = await fetchUserProfile(token);

  // 2. Create playlist
  const createResponse = await fetch(
    `${BASE_URL}/v1/users/${encodeURIComponent(user.id)}/playlists`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name,
        public: false,
        description: 'Created by Sift — Music Library Cleaner',
      }),
    },
  );

  if (!createResponse.ok) {
    throw new Error(`Failed to create playlist: ${createResponse.status}`);
  }

  const created: unknown = await createResponse.json();
  const playlistID =
    typeof created === 'object' && created !== null && 'id' in created ? created.id : undefined;
  if (typeof playlistID !== 'string' || playlistID === '') {
    throw new Error('Failed to create playlist: response had no playlist id');
  }

  // 3. Add tracks in batches of 100
  const uris = trackIDs.map((id) => `spotify:track:${id}`);

  for (let i = 0; i < uris.length; i += ADD_TRACKS_BATCH_SIZE) {
    const batch = uris.slice(i, i + ADD_TRACKS_BATCH_SIZE);

    const addResponse = await fetch(
      `${BASE_URL}/v1/playlists/${playlistID}/tracks`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ uris: batch }),
      },
    );

    if (!addResponse.ok) {
      throw new Error(`Failed to add tracks to playlist: ${addResponse.status}`);
    }
  }
}

/**
 * Load the authenticated user's playlists.
 *
 * Paginates through `GET /v1/me/playlists` (50 items per page) until every
 * playlist has been retrieved, then maps to the app's Playlist type.
 */
export async function loadPlaylists(token: string): Promise<Playlist[]> {
  const playlists: Playlist[] = [];
  let url: string | null = `${BASE_URL}/v1/me/playlists?limit=50`;

  while (url) {
    const page: SpotifyPage<SpotifyPlaylistItem> = await apiGet(url, token);
    for (const item of page.items) {
      playlists.push({
        id: item.id,
        name: item.name,
        trackCount: item.tracks.total,
        artworkURL: largestImageURL(item.images),
      });
    }
    url = nextPageURL(page.next);
  }

  return playlists;
}

/**
 * Load all tracks from a specific playlist.
 *
 * Paginates through `GET /v1/playlists/{id}/tracks` (50 items per page).
 * Filters out null tracks (unavailable items) and local files (no id).
 */
export async function loadPlaylistTracks(
  token: string,
  playlistID: string,
): Promise<Track[]> {
  const tracks: Track[] = [];
  let skipped = 0;
  let url: string | null =
    `${BASE_URL}/v1/playlists/${playlistID}/tracks?limit=50`;

  while (url) {
    const page: SpotifyPage<SpotifyPlaylistTrackItem> = await apiGet(url, token);
    skipped += mapTrackItems(page.items, tracks);
    url = nextPageURL(page.next);
  }

  logSkippedTracks(skipped, 'a playlist');
  return tracks;
}

/**
 * Delete a track from the user's Spotify library (Saved Tracks).
 */
export async function removeFromLibrary(
  token: string,
  trackIDs: string[],
): Promise<void> {
  const response = await fetch(`${BASE_URL}/v1/me/tracks`, {
    method: 'DELETE',
    headers: authHeaders(token),
    body: JSON.stringify({ ids: trackIDs }),
  });

  if (!response.ok) {
    throw new Error(`Failed to remove tracks from library: ${response.status}`);
  }
}

/**
 * Remove a track from a Spotify playlist (does not delete from library).
 */
export async function removeFromPlaylist(
  token: string,
  playlistID: string,
  trackIDs: string[],
): Promise<void> {
  const tracks = trackIDs.map((id) => ({ uri: `spotify:track:${id}` }));

  const response = await fetch(
    `${BASE_URL}/v1/playlists/${playlistID}/tracks`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({ tracks }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to remove tracks from playlist: ${response.status}`);
  }
}

/**
 * Add tracks to the user's Spotify library (Saved Tracks).
 */
export async function addToLibrary(
  token: string,
  trackIDs: string[],
): Promise<void> {
  const response = await fetch(`${BASE_URL}/v1/me/tracks`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ ids: trackIDs }),
  });

  if (!response.ok) {
    throw new Error(`Failed to add tracks to library: ${response.status}`);
  }
}

/**
 * Add tracks to a Spotify playlist.
 */
export async function addToPlaylist(
  token: string,
  playlistID: string,
  trackIDs: string[],
): Promise<void> {
  const uris = trackIDs.map((id) => `spotify:track:${id}`);

  const response = await fetch(
    `${BASE_URL}/v1/playlists/${playlistID}/tracks`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ uris }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to add tracks to playlist: ${response.status}`);
  }
}
