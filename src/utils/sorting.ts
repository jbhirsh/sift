import { Track, SortOrder } from '../types';

export function sortTracks(tracks: Track[], order: SortOrder): Track[] {
  const copy = [...tracks];
  switch (order) {
    case 'least-played':
      return copy.sort((a, b) => a.playCount - b.playCount);
    case 'most-played':
      return copy.sort((a, b) => b.playCount - a.playCount);
    case 'oldest':
      return copy.sort(
        (a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime()
      );
    case 'newest':
      return copy.sort(
        (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
      );
    case 'random':
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
  }
}
