import { useEffect, useRef, useState } from 'react';

import {
  getCurrentLocationDetails, LocationCaptureError, type CapturedLocation, type LocationFailure,
} from '@/services/location/currentLocation';

export function useLocationCapture() {
  const request = useRef<symbol | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<LocationFailure>();

  useEffect(() => () => { request.current = undefined; }, []);

  function cancelCapture() {
    request.current = undefined;
    setLoading(false);
    setFailure(undefined);
  }

  async function capture(onCaptured: (location: CapturedLocation) => void) {
    if (request.current) return;

    const token = Symbol();
    request.current = token;
    setLoading(true);
    setFailure(undefined);
    try {
      const location = await getCurrentLocationDetails();
      if (request.current === token) onCaptured(location);
    } catch (error) {
      if (request.current === token) {
        setFailure(error instanceof LocationCaptureError ? error.code : 'unavailable');
      }
    } finally {
      if (request.current === token) {
        request.current = undefined;
        setLoading(false);
      }
    }
  }

  return { loading, failure, capture, cancelCapture };
}
