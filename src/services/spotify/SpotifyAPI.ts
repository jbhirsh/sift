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
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  preview_url: string | null;
}

interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrackObject;
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

/** Map a Spotify track object and added_at date to the app's Track type. */
function mapTrackObject(t: SpotifyTrackObject, addedAt: string): Track {
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

/** Map a Spotify saved-track object to the app's Track type. */
function mapTrack(saved: SpotifySavedTrack): Track {
  return mapTrackObject(saved.track, saved.added_at);
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
  let url: string | null = `${BASE_URL}/v1/me/tracks?limit=50`;

  while (url) {
    const page: SpotifyPage<SpotifySavedTrack> = await apiGet(url, token);
    for (const item of page.items) {
      tracks.push(mapTrack(item));
    }
    url = page.next;
  }

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

  const playlist = (await createResponse.json()) as { id: string };

  // 3. Add tracks in batches of 100
  const uris = trackIDs.map((id) => `spotify:track:${id}`);

  for (let i = 0; i < uris.length; i += ADD_TRACKS_BATCH_SIZE) {
    const batch = uris.slice(i, i + ADD_TRACKS_BATCH_SIZE);

    const addResponse = await fetch(
      `${BASE_URL}/v1/playlists/${playlist.id}/tracks`,
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
    url = page.next;
  }

  return playlists;
}

/**
 * Load all tracks from a specific playlist.
 *
 * Paginates through `GET /v1/playlists/{id}/tracks` (50 items per page).
 * Filters out null tracks (local or unavailable items).
 */
export async function loadPlaylistTracks(
  token: string,
  playlistID: string,
): Promise<Track[]> {
  const tracks: Track[] = [];
  let url: string | null =
    `${BASE_URL}/v1/playlists/${playlistID}/tracks?limit=50`;

  while (url) {
    const page: SpotifyPage<SpotifyPlaylistTrackItem> = await apiGet(url, token);
    for (const item of page.items) {
      if (item.track) {
        tracks.push(mapTrackObject(item.track, item.added_at));
      }
    }
    url = page.next;
  }

  return tracks;
}
