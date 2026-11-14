import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { z } from 'zod';

import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { customerRequest } from '@/services/api/session';

const supported = (Platform.OS === 'android' || Platform.OS === 'ios')
  && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

if (supported) Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

const registered = z.object({ id: z.uuid(), notification_enabled: z.literal(true), last_registered_at: z.string() });
const bookingId = z.uuid();
type Status = 'loading' | 'on' | 'off' | 'permissionRequired' | 'denied' | 'error' | 'unavailable';
type Permission = 'granted' | 'denied' | 'undetermined';
type PushState = {
  status: Status;
  busy: boolean;
  optedIn: boolean;
  permission?: Permission;
  lastRegisteredAt?: string;
  update: (enabled: boolean) => void;
  retry: () => void;
};
const PushContext = createContext<PushState | undefined>(undefined);
const defaultPermissionPromptKey = 'solar-care.push.default-permission-requested';

// The runtime SDK includes the common Expo permission fields on both platforms.
type PermissionResult = Pick<Notifications.NotificationPermissionsStatus, 'ios'> & {
  granted: boolean;
  status: Permission;
  canAskAgain: boolean;
};
const permissionStatus = (value: PermissionResult): Permission => value.granted
  || value.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ? 'granted' : value.status;

function disableOnServer() {
  return customerRequest('/customers/me/notification-preferences', z.undefined(), {
    method: 'PATCH', body: { enabled: false },
  });
}

export function PushNotifications({ children }: PropsWithChildren) {
  const { profile, phase } = useApplication();
  const key = phase === 'main' && profile ? `solar-care.push.${profile.customerId}` : null;
  const current = useRef(key);
  current.current = key;
  const writes = useRef(Promise.resolve());
  const pending = useRef(0);
  const [state, setState] = useState<Omit<PushState, 'update' | 'retry'>>({
    status: supported ? 'loading' : 'unavailable', busy: false, optedIn: false,
  });

  function sync(target: string, intent?: boolean, nativeToken?: Notifications.DevicePushToken, force = false) {
    if (!supported || (!force && pending.current > 0 && !nativeToken && intent === undefined)) return;
    pending.current += 1;
    setState((previous) => ({ ...previous, busy: true }));
    writes.current = writes.current.then(async () => {
      if (current.current !== target) return;
      let optedIn = false;
      let systemPermission: Permission | undefined;
      try {
        let preference = await SecureStore.getItemAsync(target);
        if (intent !== undefined) {
          preference = intent ? 'enabled' : 'disabled_pending';
          await SecureStore.setItemAsync(target, preference);
        }
        // The previous default left no stored preference. Preserve both forms of explicit opt-out.
        optedIn = preference === null || preference === 'enabled';
        if (preference === 'disabled_pending' && current.current === target) {
          await disableOnServer();
          await SecureStore.setItemAsync(target, 'disabled');
        }
        if (optedIn && Platform.OS === 'android') await Notifications.setNotificationChannelAsync('general', {
          name: 'Solar Care', importance: Notifications.AndroidImportance.DEFAULT,
        });
        let permission = await Notifications.getPermissionsAsync() as PermissionResult;
        systemPermission = permissionStatus(permission);
        if (!optedIn) {
          if (current.current === target) setState({ status: 'off', busy: true, optedIn, permission: systemPermission });
          return;
        }
        if (systemPermission === 'undetermined' && permission.canAskAgain && AppState.currentState === 'active') {
          const firstDefaultPrompt = preference === null && !await SecureStore.getItemAsync(defaultPermissionPromptKey);
          if (current.current !== target) return;
          if (intent === true || firstDefaultPrompt) {
            await SecureStore.setItemAsync(defaultPermissionPromptKey, '1');
            if (current.current !== target) return;
            permission = await Notifications.requestPermissionsAsync({
              ios: { allowAlert: true, allowSound: true, allowBadge: false },
            }) as PermissionResult;
            systemPermission = permissionStatus(permission);
          }
        }
        if (current.current !== target) return;
        if (systemPermission !== 'granted') {
          await disableOnServer();
          const status = systemPermission === 'undetermined' && permission.canAskAgain ? 'permissionRequired' : 'denied';
          if (current.current === target) setState({ status, busy: true, optedIn, permission: systemPermission });
          return;
        }
        const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
        if (typeof projectId !== 'string' || !projectId) throw new Error('Missing EAS project ID');
        const { data } = await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken: nativeToken });
        if (current.current !== target) return;
        const result = await customerRequest('/customers/me/devices', registered, {
          method: 'POST', body: { expo_push_token: data, platform: Platform.OS, app_version: Constants.expoConfig?.version },
        });
        if (current.current === target) setState({ status: 'on', busy: true, optedIn, permission: systemPermission,
          lastRegisteredAt: result.last_registered_at });
      } catch {
        if (current.current === target) setState({ status: 'error', busy: true, optedIn, permission: systemPermission });
      }
    }).finally(() => {
      pending.current -= 1;
      if (current.current === target && pending.current === 0) setState((previous) => ({ ...previous, busy: false }));
    });
  }

  useEffect(() => {
    if (!supported || !key) return;
    sync(key, undefined, undefined, true);
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') sync(key); });
    const tokenChange = Notifications.addPushTokenListener((token) => sync(key, undefined, token));
    return () => { foreground.remove(); tokenChange.remove(); };
  // The queue and active-account guard live in refs. Resubscribe only when the account changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <PushContext.Provider value={{
    ...state, update: (value) => { if (key) sync(key, value); }, retry: () => { if (key) sync(key); },
  }}>
    <NotificationLinks active={supported && Boolean(key)} />
    {children}
  </PushContext.Provider>;
}

function NotificationLinks({ active }: { active: boolean }) {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !navigationReady) return;
    function open(response: Notifications.NotificationResponse | null) {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const { request } = response.notification;
      if (handled.current === request.identifier) return;
      handled.current = request.identifier;
      Notifications.clearLastNotificationResponse();
      const data = request.content.data;
      if (!data) return;
      if (data.destination === 'home') router.push(appRoutes.home);
      else if (data.destination === 'bookings') router.push(appRoutes.myBookings);
      else if (data.destination === 'contact') router.push(appRoutes.contact);
      else if (data.destination === 'booking' && bookingId.safeParse(data.bookingId).success) {
        router.push({ pathname: appRoutes.bookingDetails, params: { bookingId: String(data.bookingId) } });
      }
    }
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    open(Notifications.getLastNotificationResponse());
    return () => listener.remove();
  }, [active, navigationReady]);
  return null;
}

export function usePushNotifications() {
  const context = useContext(PushContext);
  if (!context) throw new Error('PushNotifications is required');
  return context;
}
