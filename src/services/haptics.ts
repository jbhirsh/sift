import * as Haptics from 'expo-haptics';
import type { Decision } from '../types';

// Taps the user feels on the Sift screen. iOS skips them when System
// Haptics is off in Settings, so there's no setting here. Each is fire and
// forget: a device without a Taptic Engine just does nothing.

function quietly(feedback: Promise<void>): void {
  feedback.catch(() => {});
}

/** A decision taken: a firm tap for Keep and Remove, a light tick for Skip. */
export function decisionHaptic(decision: Decision): void {
  quietly(
    decision === 'skip'
      ? Haptics.selectionAsync()
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  );
}

/** A dragged card crossing the point where letting go decides, either way. */
export function thresholdHaptic(): void {
  quietly(Haptics.selectionAsync());
}

/** A decision taken back. */
export function undoHaptic(): void {
  quietly(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}
