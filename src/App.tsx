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
import SetupScreen from './screens/SetupScreen';
import LoadingScreen from './screens/LoadingScreen';
import SiftScreen from './screens/SiftScreen';
import DoneScreen from './screens/DoneScreen';
import SettingsScreen from './screens/SettingsScreen';

Sentry.init({
  dsn: 'https://34686f32423b6ac06bd69e774107cab0@o4511157588918272.ingest.us.sentry.io/4511164573548544',
  sendDefaultPii: true,
  tracesSampleRate: 0.2,
  enableLogs: true,
  profilesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    Sentry.reactNativeTracingIntegration(),
    Sentry.mobileReplayIntegration(),
  ],
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
      case 'paused':
      case 'done':
        return <DoneScreen />;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}

      {state.phase !== 'setup' && (
        <View style={[styles.settingsButtonContainer, { top: insets.top }]}>
          <GlassCard intensity="thin" radius={18}>
            <TouchableOpacity
              testID="settings-button"
              style={styles.settingsButton}
              onPress={() => setSettingsVisible(true)}
              activeOpacity={0.7}
            >
              <SymbolView name="gearshape" size={20} tintColor={colors.textSecondary} />
            </TouchableOpacity>
          </GlassCard>
        </View>
      )}

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
          <SiftProvider>
            <PhaseRouter />
          </SiftProvider>
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
    top: 0,
    right: 0,
    marginTop: 8,
    marginRight: 8,
  },
  settingsButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
