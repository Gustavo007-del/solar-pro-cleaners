# Solar Care push notifications

The dashboard manages campaigns through FastAPI. PostgreSQL stores devices, campaigns, occurrence history and the delivery queue. A separate Python process reads the queue, sends through Expo and checks receipts. No Redis, Celery, separate broker or dashboard timer is needed.

## Deploy the backend and worker

1. Back up PostgreSQL. Run `python -m alembic upgrade head` from `backend/` using the existing migration credentials. Confirm revision `20261112_0010` (or a later head). Apply the migration before switching the FastAPI release: logout and deactivation now also update device registrations. Keep the tables when rolling back binaries, so the queue and execution history survive.
2. Deploy the FastAPI web service with its existing command, `python -m app.serve`. Check `/health/ready`. Deploy the dashboard revision so its authenticated API proxy accepts the new routes. Sign out and back in if it still has the previous permission list cached.
3. Deploy the same backend revision as **one continuously running background worker**. On Render, add a [Background Worker](https://render.com/docs/background-workers) from the same repository and branch:

   | Render field | Value |
   | --- | --- |
   | Root directory | `backend` |
   | Build command | `pip install -r requirements.txt` |
   | Start command | `python -m app.modules.notifications.worker` |
   | Instances | 1 to start |
   | Environment | Copy the existing backend environment/configuration, including the same Supabase `DATABASE_URL` and connection mode. Set `DB_POOL_SIZE=1` and `DB_MAX_OVERFLOW=0` for a worker using a session or direct pool. |

   Use Render environment settings to share required secrets. The worker needs PostgreSQL and outbound HTTPS, no web port or incoming traffic. For containers, run the same backend image with the worker command as a separate service. Do not run migrations in the worker start command.

Render [does not offer free instances for background workers](https://render.com/docs/free). You can keep your web service separate and run this worker on a paid Render instance or another always-on host connected to the same Supabase database. A free sleeping web instance cannot substitute for it. Scheduled sends queue in the database if the worker is unavailable and may run late after it resumes. Even with a continuously running worker, polling, queue length and push provider processing affect timing.

### Worker environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `NOTIFICATION_POLL_SECONDS` | 3 | Time between polls |
| `NOTIFICATION_BATCH_SIZE` | 100 | Maximum tokens per Expo send request and receipts per check |
| `NOTIFICATION_CLAIM_LIMIT` | 10 | Maximum due campaigns claimed in one transaction |
| `NOTIFICATION_RETRY_LIMIT` | 4 | Total submission attempts for explicitly retryable failures |
| `NOTIFICATION_RECEIPT_RETRY_LIMIT` | 6 | Maximum receipt checks per ticket |
| `NOTIFICATION_RECEIPT_DELAY_SECONDS` | 900 | Delay before checking new Expo tickets |
| `NOTIFICATION_HTTP_TIMEOUT_SECONDS` | 10 | Expo network timeout in seconds |
| `NOTIFICATION_MIN_INTERVAL_MINUTES` | 15 | Minimum recurrence, enforce the same value on web and worker |
| `RATE_LIMIT_NOTIFICATION_DEVICE` | 120 | Registrations per source in the existing API rate-limit window |
| `RATE_LIMIT_NOTIFICATION_ACTION` | 30 | Campaign actions per source in the existing API rate-limit window |
| `EXPO_PUSH_ACCESS_TOKEN` | unset | Server-only token. Set when push security is enabled in the Expo project. |

Use one Expo project per deployment database. Use a separate test database and API for preview device tests. Never test a broadcast against a production audience. Do not put `EXPO_PUSH_ACCESS_TOKEN` or an FCM service account key in app config, an `EXPO_PUBLIC_*` variable, or the Next.js environment.

## Configure mobile credentials and rebuild

**Android**

1. In Firebase, register the Android package from `app.config.ts` for the build you will install. The default production package is `com.solarcare.app`; preview appends `.preview`, and development appends `.development`. An `ANDROID_APPLICATION_ID` override changes the base. In Expo, use the matching EAS project and application identifier.
2. Download that Android client's `google-services.json`. For an EAS build, create an [EAS file environment variable](https://docs.expo.dev/eas/environment-variables/) called `GOOGLE_SERVICES_JSON` in the matching environment (development, preview or production) and upload that file. For local native builds, use an ignored `google-services.json` at the app root or set `GOOGLE_SERVICES_JSON` to its file path. If using a preview build with a staging API, set the `EXPO_PUBLIC_API_BASE_URL` in its build profile to the staging versioned API URL before building.
3. Separately, upload the **Firebase service account key** for FCM V1 in the Expo project credentials for the same application identifier. Use the Expo Dashboard or run `npx eas-cli@latest credentials --platform android` and choose the relevant profile and FCM V1 credentials. Keep this private key outside the repository. It is different from the client file in step 2. See the [Expo FCM V1 guide](https://docs.expo.dev/push-notifications/fcm-credentials/).
4. Build and install a fresh preview APK on a test device. A native build is needed for the new permissions, channel and Firebase settings.

   ```powershell
   npx eas-cli@latest build --platform android --profile preview
   ```

   After verification, build the production Play Store AAB:

   ```powershell
   npx eas-cli@latest build --platform android --profile production
   ```

**iOS:** Use an Apple Developer team with Push Notifications enabled for the matching bundle identifier. In EAS credentials configure the APNs push key for that team and project, then install a new iOS build on a registered test device. See [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

## Use and verify

- On the test phone, sign in and open **Settings → Push notifications → Turn On Notifications**. Grant permission. Confirm the app shows notifications are on. Denying permission never prevents using bookings. The app synchronizes permission and token changes when it returns to the foreground and when the native token changes.
- In the dashboard, open **Notifications → New campaign**. Create a draft for the test customer. Review the live preview and the schedule, then confirm **Send now**. Admins can send to selected customers. Only owners can activate or resume an all-customer campaign, and they must confirm the audience.
- Test a one-time and a recurring send. Close the dashboard, put the phone in the background, then close the phone app and try again. Verify foreground presentation, tap navigation, and opt-out. A push that opens a booking still uses the existing booking ownership check.
- On campaign details, use **Refresh** to check history. An accepted ticket means Expo queued the submission. `provider_accepted` means Expo reported successful handoff to FCM or APNs. Neither confirms the phone displayed it or the person read it. See [Expo tickets and receipts](https://docs.expo.dev/push-notifications/sending-notifications/).
- For failures, look at the delivery error code and worker logs. `DeviceNotRegistered` deactivates only the affected token version. `InvalidCredentials` or `MismatchSenderId` usually means the native app identifier or provider credentials do not match the build. Fix configuration and test a new targeted campaign.

### Scheduler behavior and recovery

One PostgreSQL transaction locks the due campaign and records the occurrence and per-device queue. Unique constraints enforce one execution per scheduled timestamp and one delivery row per device and execution. Delivery and receipt claims use row locks. The worker does not hold a transaction open during an Expo request.

A restarting worker claims the oldest overdue occurrence of each due campaign. For recurring campaigns, after that occurrence finishes submitting, it schedules the next future slot rather than replaying every missed slot. Calendar schedules follow the configured IANA timezone; short months use their last day if needed, and a recurring wall time in a spring-forward gap shifts forward for that occurrence. An ambiguous wall time without an offset uses its earlier offset. Minute and hour intervals are elapsed time. Pausing prevents future runs; a run already claimed can finish. Cancellation stops queued sends, but an in-flight submission can still arrive.

Expo HTTP 429/5xx and rate-limited tickets use bounded exponential backoff. An ambiguous outcome (timeout, unrecognized response or worker crash during submission) is recorded as `submission_unknown` rather than automatically replayed. Expo does not provide an exactly-once submission guarantee, so review unknown outcomes before creating a new send. Receipt polling is safe to retry independently. Structured worker logs report starts, stops, executions and operational failures without tokens or message contents.

### Local automated checks

From `backend/`, with a local disposable PostgreSQL cluster:

```powershell
$env:TEST_POSTGRES_URL = 'postgresql://postgres@127.0.0.1:5432/postgres'
uv run --python 3.12 --with-requirements requirements.txt --with httpx python -m tests.run_notification_integration
```

This checks the migrated database, authenticated APIs, concurrency, restarts, retries and receipts with a simulated Expo transport. A physical device with the credentials above is still required for a real push test.
