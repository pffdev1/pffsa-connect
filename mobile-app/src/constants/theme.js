import { MD3LightTheme } from 'react-native-paper';

export const COLORS = {
  primary: '#003a78',    // Azul Pedersen
  secondary: '#dd052b',  // Rojo Pedersen
  background: '#F5F7FA',
  white: '#FFFFFF',
  text: '#1A1A1A',       // Texto principal
  textLight: '#666666',  // Texto secundario
  danger: '#dd052b',
  success: '#28a745',
  border: '#E1E4E8'
};

export const PAPER_THEME = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.secondary,
    background: COLORS.white,
    surface: COLORS.white,
    onSurface: COLORS.text,
    onSurfaceVariant: COLORS.textLight,
    outline: COLORS.border
  }
};

export const GLOBAL_STYLES = {
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  }
};
