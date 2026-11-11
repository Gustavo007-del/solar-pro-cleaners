import * as Location from 'expo-location';

import { locationCoordinatesSchema, type BookingAddress, type LocationCoordinates } from '@/types/booking';

import { getAddressFromCoordinates } from './reverseGeocoding';

export type LocationFailure = 'permissionDenied' | 'permissionBlocked' | 'servicesDisabled' | 'timeout' | 'unavailable';

export class LocationCaptureError extends Error {
  constructor(readonly code: LocationFailure) {
    super(code);
  }
}

export type CapturedLocation = {
  coordinates: LocationCoordinates;
  address: BookingAddress | null;
};

const positionTimeoutMs = 15_000;
const geocodingTimeoutMs = 5_000;
let pendingCapture: Promise<CapturedLocation> | undefined;
let requestedPermission = false;

async function withTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LocationCaptureError('timeout')), milliseconds);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function requestLocationPermission() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return;

  if (!current.canAskAgain) throw new LocationCaptureError('permissionBlocked');
  if (requestedPermission) throw new LocationCaptureError('permissionDenied');
  requestedPermission = true;
  const response = await Location.requestForegroundPermissionsAsync();
  if (!response.granted) throw new LocationCaptureError(response.canAskAgain ? 'permissionDenied' : 'permissionBlocked');
}

async function captureLocation(): Promise<CapturedLocation> {
  await requestLocationPermission();
  if (!(await Location.hasServicesEnabledAsync())) throw new LocationCaptureError('servicesDisabled');

  const position = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false }),
    positionTimeoutMs,
  );
  const coordinates = locationCoordinatesSchema.parse(position.coords);
  const address = await withTimeout(getAddressFromCoordinates(coordinates), geocodingTimeoutMs).catch(() => null);

  return { coordinates, address };
}

export async function getCurrentLocationDetails(): Promise<CapturedLocation> {
  if (pendingCapture) return pendingCapture;

  const capture = captureLocation();
  pendingCapture = capture;
  try {
    return await capture;
  } finally {
    pendingCapture = undefined;
  }
}
