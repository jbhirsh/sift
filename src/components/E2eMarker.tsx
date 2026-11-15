import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tracing } from '../services/trace';

/**
 * E2E only: a hidden element with testID `id` while `when` holds, for a
 * Maestro flow or the accessibility audit to wait on (services/e2eMarks).
 * Sized and on screen, so Maestro counts it as visible; it takes no touch
 * and changes no layout. Nothing outside the E2E build.
 */
export default function E2eMarker({ id, when }: { id: string; when: boolean }) {
  if (!tracing || !when) return null;
  return <View testID={id} style={styles.marker} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  marker: { position: 'absolute', top: 0, left: 0, width: 1, height: 1 },
});
