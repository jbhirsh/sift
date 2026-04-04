import React, { useState } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SiftProvider, useSift } from './context/SiftContext';
import SetupScreen from './screens/SetupScreen';
import LoadingScreen from './screens/LoadingScreen';
import SiftScreen from './screens/SiftScreen';
import DoneScreen from './screens/DoneScreen';
import SettingsScreen from './screens/SettingsScreen';

function PhaseRouter() {
  const { state } = useSift();
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
          <TouchableOpacity
            testID="settings-button"
            style={styles.settingsButton}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <SymbolView name="gearshape" size={24} tintColor="rgba(60,60,67,0.6)" />
          </TouchableOpacity>
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

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <SiftProvider>
          <PhaseRouter />
        </SiftProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  settingsButtonContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  settingsButton: {
    padding: 12,
    marginTop: 8,
    marginRight: 8,
  },
  settingsIcon: {},
});
