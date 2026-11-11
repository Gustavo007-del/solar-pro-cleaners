import Constants from 'expo-constants';

import branding from './metadata.json';

const manifest = Constants.expoConfig;
const nameMl: unknown = manifest?.extra?.nameMl;

export const appMetadata = {
  ...branding,
  name: manifest?.name ?? branding.name,
  nameMl: typeof nameMl === 'string' ? nameMl : branding.nameMl,
  version: manifest?.version ?? branding.version,
};
