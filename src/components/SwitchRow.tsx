import React from 'react';
import { Pressable, StyleProp, Switch, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface SwitchRowProps {
  /** What VoiceOver reads for the row. */
  label: string;
  /** Read after the value: what the switch does, when the row says more. */
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
  style?: StyleProp<ViewStyle>;
  /** The row's visible text, before the switch. */
  children: React.ReactNode;
}

/**
 * A row that is one switch: a tap anywhere on it flips the value, and
 * VoiceOver reads it as one element ("<label>, switch, off").
 *
 * The native switch only draws the value: it takes no touches. A UISwitch
 * decides its toggle from touch-down and touch-up as UIKit hands them over,
 * so when the main thread is busy for the length of a tap (about 100 ms)
 * both arrive together and it doesn't toggle, though the app saw the tap:
 * flow 15 lost one that way on #197's run. The row's press, through React
 * Native's touch handling, sees both and goes.
 */
export default function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  testID,
  style,
  children,
}: SwitchRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={style}
    >
      {children}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch value={value} trackColor={{ true: colors.accent, false: colors.quaternary }} />
      </View>
    </Pressable>
  );
}
