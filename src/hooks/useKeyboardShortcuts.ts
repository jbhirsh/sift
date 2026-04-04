/**
 * Hook for iPad / Mac Catalyst hardware keyboard support.
 *
 * Planned key bindings:
 *   Left arrow  -> keep
 *   Right arrow -> remove
 *   's'         -> skip
 *   Space       -> toggle play/pause
 *
 * TODO: Wire up hardware keyboard events once we add iPad keyboard
 * support (e.g., via a hidden TextInput capturing onKeyPress, or a
 * native module for full key-event access).
 */
export function useKeyboardShortcuts(_callbacks: {
  onKeep: () => void;
  onRemove: () => void;
  onSkip: () => void;
  onTogglePlayPause: () => void;
}) {
  // No-op for now — will be implemented when we add iPad keyboard support.
}
