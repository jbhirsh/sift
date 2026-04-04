import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { RADIUS, SPACING, SHADOWS } from '../theme';
import { useThemeColors } from '../theme/useThemeColors';

const ACCENT = '#007AFF'; // iOS system blue

type Variant = 'primary' | 'secondary' | 'plain';
type Size = 'small' | 'regular' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  icon?: string;
  color?: string;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'regular',
  disabled = false,
  icon,
  color,
  testID,
}: ButtonProps) {
  const colors = useThemeColors();
  const tint = color ?? ACCENT;

  const containerStyle: ViewStyle[] = [
    styles.base,
    sizeStyles[size],
    variantContainer(variant, tint, disabled),
    variant !== 'plain' ? SHADOWS.button : {},
  ];

  const textStyle: TextStyle[] = [
    styles.label,
    sizeLabelStyles[size],
    variantLabel(variant, tint, colors.text, disabled),
  ];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={textStyle}>
        {icon ? `${icon} ${title}` : title}
      </Text>
    </Pressable>
  );
}

function variantContainer(
  variant: Variant,
  tint: string,
  disabled: boolean,
): ViewStyle {
  const opacity = disabled ? 0.4 : 1;

  switch (variant) {
    case 'primary':
      return {
        backgroundColor: tint,
        opacity,
      };
    case 'secondary':
      return {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: tint,
        opacity,
      };
    case 'plain':
      return {
        backgroundColor: 'transparent',
        opacity,
      };
  }
}

function variantLabel(
  variant: Variant,
  tint: string,
  defaultText: string,
  disabled: boolean,
): TextStyle {
  switch (variant) {
    case 'primary':
      return { color: '#FFFFFF' };
    case 'secondary':
      return { color: disabled ? defaultText : tint };
    case 'plain':
      return { color: disabled ? defaultText : tint };
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  label: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});

const sizeStyles: Record<Size, ViewStyle> = {
  small: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.xl,
  },
  regular: {
    paddingVertical: SPACING.base,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.sm,
  },
  large: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    borderRadius: RADIUS.sm,
    width: '100%' as unknown as number,
  },
};

const sizeLabelStyles: Record<Size, TextStyle> = {
  small: { fontSize: 13 },
  regular: { fontSize: 16 },
  large: { fontSize: 18 },
};
