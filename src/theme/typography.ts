import { StyleSheet } from 'react-native';

// System fonts provide Malayalam fallback and keep native text scaling enabled.
export const typography = StyleSheet.create({
  display: { fontSize: 34, lineHeight: 47, fontWeight: '700' },
  heading: { fontSize: 26, lineHeight: 37, fontWeight: '700' },
  section: { fontSize: 19, lineHeight: 29, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 26, fontWeight: '400' },
  supporting: { fontSize: 14, lineHeight: 23, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 23, fontWeight: '600' },
  button: { fontSize: 15, lineHeight: 24, fontWeight: '700' },
  metadata: { fontSize: 12, lineHeight: 20, fontWeight: '600' },
});
