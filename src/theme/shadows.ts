import { colors } from './colors';

export const elevation = { card: 1, overlay: 4 } as const;

export const shadows = {
  card: {
    shadowColor: colors.deep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: elevation.card,
  },
  overlay: {
    shadowColor: colors.deep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: elevation.overlay,
  },
} as const;
