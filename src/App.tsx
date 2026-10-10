import React, { useState } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import { SymbolView } from 'expo-symbols';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { SiftProvider, useSift } from './context/SiftContext';
import GlassCard from './components/GlassCard';
import { ErrorBoundary } from './components/ErrorBoundary';
import SetupScreen from './screens/SetupScreen';
import LoadingScreen from './screens/LoadingScreen';
import SiftScreen from './screens/SiftScreen';
import DoneScreen from './screens/DoneScreen';
import SettingsScreen from './screens/SettingsScreen';
import { SETTINGS_BUTTON, SPACING } from './theme';
import { scrubBreadcrumb, scrubEvent } from './utils/sentryScrub';

Sentry.init({
  // DSN is read from the EXPO_PUBLIC_SENTRY_DSN env var (see .env.example).
  // Provide the real value in an untracked .env.local for local runs; leave
  // it unset to disable Sentry reporting entirely.
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Only what diagnosing crashes needs (#147): no default PII, no session
  // replay, no profiling, few traces. JavaScript-side breadcrumbs and events
  // have quoted names and URL queries scrubbed (utils/sentryScrub) before
  // they leave.
  sendDefaultPii: false,
  tracesSampleRate: 0.05,
  integrations: [Sentry.reactNativeTracingIntegration()],
  // No trace headers on requests to other services (LRCLIB).
  tracePropagationTargets: [],
  // Native crash reports skip the JavaScript hooks below, and the native SDK
  // records every NSURLSession request as a breadcrumb, LRCLIB's track and
  // artist query included. The React Native SDK passes options through to
  // sentry-cocoa's options dictionary, but doesn't declare this one.
  ...({ enableNetworkBreadcrumbs: false } as Record<string, unknown>),
  beforeBreadcrumb: scrubBreadcrumb,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
});

function PhaseRouter() {
  const { state } = useSift();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const renderScreen = () => {
    switch (state.phase) {
      case 'setup':
        return <SetupScreen />;
      case 'loading':
        return <LoadingScreen />;
      case 'sifting':
        return <SiftScreen />;
      case 'done':
        return <DoneScreen />;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}

      {/* On every screen, Setup included: Settings holds Start at chorus
          and Check Connection, which people want before the first song.
          Sized and placed to mirror the Sift header's back button. */}
      <View style={[styles.settingsButtonContainer, { top: insets.top + SETTINGS_BUTTON.top }]}>
        <GlassCard intensity="thin" radius={20}>
          <TouchableOpacity
            testID="settings-button"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.settingsButton}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <SymbolView name="gearshape" size={20} tintColor={colors.textSecondary} />
          </TouchableOpacity>
        </GlassCard>
      </View>

      <Modal
        testID="settings-modal"
        visible={settingsVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <SettingsScreen onClose={() => setSettingsVisible(false)} />
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* Inside ThemeProvider so the fallback can use theme colors;
              around SiftProvider so Restart remounts it into setup. */}
          <ErrorBoundary>
            <SiftProvider>
              <PhaseRouter />
            </SiftProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  settingsButtonContainer: {
    position: 'absolute',
    right: SPACING['2xl'],
  },
  settingsButton: {
    width: SETTINGS_BUTTON.size,
    height: SETTINGS_BUTTON.size,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
