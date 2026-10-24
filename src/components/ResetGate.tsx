import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resetAppData, resetRequested } from '../services/e2eReset';
import { trace } from '../services/trace';

// One reset per launch, even if the gate is ever mounted again.
let resetDone = false;

type GateState = 'ready' | 'resetting' | { error: string };

/**
 * Holds the app back until an E2E launch's reset (services/e2eReset) has
 * cleared what it saves, so no store reads the last flow's data. Every
 * other launch renders straight through. A reset that fails shows why
 * (testID reset-failed) instead of starting on half-cleared data, so the
 * flow fails at once and its screenshot names the cause.
 */
export default function ResetGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>(() =>
    resetRequested && !resetDone ? 'resetting' : 'ready',
  );
  useEffect(() => {
    if (state !== 'resetting') return;
    resetAppData().then(
      () => {
        resetDone = true;
        setState('ready');
      },
      (err: unknown) => {
        trace('reset-failed', { error: String(err) });
        setState({ error: String(err) });
      },
    );
  }, [state]);
  if (state === 'ready') return <>{children}</>;
  if (state === 'resetting') return null;
  return (
    <View style={styles.failed}>
      <Text testID="reset-failed">The E2E reset failed: {state.error}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  failed: { flex: 1, justifyContent: 'center', padding: 24 },
});
