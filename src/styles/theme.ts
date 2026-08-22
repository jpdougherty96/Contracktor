import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  appBackground: '#F6F3EC',
  cardBackground: '#FFFDF8',
  danger: '#A33A2F',
  live: '#5FA477',
  mutedText: '#667382',
  pressedGreen: '#203B2C',
  primaryGreen: '#294B38',
  standardBorder: '#D8D2C6',
  strongBorder: '#C7BFAF',
  text: '#202629',
  warmWhite: '#FFFDF8',
  warning: '#B7791F',
} as const;

export const radii = {
  button: 12,
  card: 14,
} as const;

const baseButton: ViewStyle = {
  alignItems: 'center',
  borderRadius: radii.button,
  justifyContent: 'center',
  minHeight: 48,
};

const baseButtonText: TextStyle = {
  fontSize: 16,
  fontWeight: '800',
};

export const buttonStyles = {
  danger: {
    container: {
      ...baseButton,
      backgroundColor: colors.danger,
    },
    text: {
      ...baseButtonText,
      color: colors.warmWhite,
    },
  },
  ghost: {
    container: {
      ...baseButton,
      backgroundColor: 'transparent',
    },
    text: {
      ...baseButtonText,
      color: colors.primaryGreen,
    },
  },
  primary: {
    container: {
      ...baseButton,
      backgroundColor: colors.primaryGreen,
    },
    text: {
      ...baseButtonText,
      color: colors.warmWhite,
    },
  },
  secondary: {
    container: {
      ...baseButton,
      backgroundColor: colors.cardBackground,
      borderColor: colors.strongBorder,
      borderWidth: 1,
    },
    text: {
      ...baseButtonText,
      color: colors.primaryGreen,
    },
  },
} as const;
