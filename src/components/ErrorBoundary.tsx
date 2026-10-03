import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { Button } from './Button';
import { FONTS, SPACING } from '../theme';
import { useTheme } from '../theme/ThemeContext';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** Bumped on restart so the subtree remounts with fresh state. */
  resetKey: number;
}

/**
 * Root error boundary. Without one, any error thrown while rendering
 * unmounts the whole app and leaves a blank screen. This reports the error
 * to Sentry and shows a fallback whose Restart remounts the subtree, so the
 * app starts over from setup with fresh state.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    Sentry.captureException(error, {
      tags: { flow: 'render' },
      contexts: { react: { componentStack: info.componentStack ?? '' } },
    });
  }

  private handleRestart = (): void => {
    this.setState((prev) => ({ hasError: false, resetKey: prev.resetKey + 1 }));
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback onRestart={this.handleRestart} />;
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

function ErrorFallback({ onRestart }: { onRestart: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="error-fallback"
    >
      <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        Sift hit an unexpected error. Restart to go back to the start screen.
      </Text>
      <Button title="Restart" onPress={onRestart} testID="error-restart" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.lg,
  },
  title: {
    ...FONTS.headline,
    fontSize: 20,
    textAlign: 'center',
  },
  message: {
    ...FONTS.body,
    fontSize: 15,
    textAlign: 'center',
  },
});
