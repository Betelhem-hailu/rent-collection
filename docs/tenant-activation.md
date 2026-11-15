# Tenant activation and password setup

Landlord-created tenants already have a global `User.id` and lease links. Activation updates that user; it never creates a second account or changes a landlord's credentials. Eligible users are active tenants with a null password and `UNINITIALIZED` or `PHONE_VERIFIED` authentication state. Existing password holders use normal login. This flow does not reset passwords, recover lost phone numbers, reactivate disabled accounts, or change business roles.

## Local mock SMS

Set this in `backend/.env`, then restart the backend:

```env
SMS_VERIFICATION_PROVIDER=mock
```

The workspace's local environment is configured this way. Visit `/login`, choose **Activate tenant account**, or open `/activate-tenant`. Enter the phone recorded on an existing tenant's lease. Within a few seconds the backend terminal prints:

```text
[MOCK SMS - no message sent] Phone ending 4567: activation code 123456
```

The displayed code is randomly generated for each request; the example is not a working or fixed code. Enter the code, choose a password with at least 15 characters, then sign in normally. Existing leases and payment records remain attached to the same tenant. Mock codes never appear in API responses or the browser. The mock adapter refuses to operate with `NODE_ENV=production`; do not expose a development server or its terminal logs publicly.

## Gateway boundary

`src/modules/auth/sms-verification.ts` defines the `SmsVerification` gateway and selects an adapter. `gateways/mock-sms.gateway.ts` handles local development. `gateways/twilio-sms.gateway.ts` is the separate real-provider adapter. New providers implement `assertConfigured`, `start(phone)` and `check(phone, providerReference, code)` without changing account activation or password setup.

For real SMS, create a [Twilio Verify service](https://www.twilio.com/docs/verify/api/service), then configure:

```env
SMS_VERIFICATION_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_VERIFY_SERVICE_SID=VA...
TWILIO_API_KEY=SK...
TWILIO_API_SECRET=...
NODE_ENV=production
```

For local Twilio testing, `TWILIO_AUTH_TOKEN` can replace the API key and secret. Never put these values in frontend environment variables. Confirm destination-country permissions and SMS delivery using your provider account before rollout. The adapter starts an SMS verification and checks the provider's approval for the exact phone, service and verification reference. It does not accept a client assertion that a code was verified. See [Twilio verification checks](https://www.twilio.com/docs/verify/api/verification-check).

The legacy `/auth/tenant/login` endpoint uses an independent trusted-verifier JWT and is separate from activation. The mock does not manufacture those JWTs. The new password setup proof cannot be used as a login token.

## API and safeguards

All paths are under `/api/v1/auth/tenant/activation` (also available under `/api`). Responses use `Cache-Control: no-store`.

| Endpoint | Request | Result |
| --- | --- | --- |
| `POST /start` | `{ phone }` | HTTP 202 with a challenge ID, 600-second expiry and 60-second retry interval |
| `POST /verify` | `{ challengeId, code }` | A random, restricted password-setup credential valid for 600 seconds |
| `POST /password` | `{ challengeId, setupToken, password }` | Updates the existing user and consumes the credential atomically; tenant signs in normally |

The request endpoint returns the same message and a random challenge identifier for unknown, already claimed, disabled or phone-throttled accounts. It queues delivery in PostgreSQL instead of waiting for the provider, avoiding an account-existence signal from provider latency. Only eligible accounts enqueue messages. A dispatcher polls every five seconds, claims jobs under a row lock, and can resume an interrupted delivery after 30 seconds, up to two delivery attempts. Provider delivery is at least once if a process fails after sending but before recording the response. Failed deliveries allow the tenant to retry after the normal cooldown.

Per phone: at most three requests per 15-minute window, at least 60 seconds apart, and five code checks per window. Resends invalidate previous challenge IDs and setup credentials without resetting failed attempts. Both the code and setup credential expire after ten minutes. Setup credentials are stored only as SHA-256 hashes; passwords use bcrypt with cost 12 and a 72-byte upper limit to prevent silent truncation. The user row is locked for each activation transition. Password setup rechecks account eligibility, the bound phone, expiry and the proof before committing `password`, `authState=PASSWORD`, and `phoneVerifiedAt` on the existing user, together with proof consumption.

Per client IP: 20 start, 60 verify, and 30 password requests per 15 minutes. These counters persist across restarts and instances. Express uses its directly connected peer by default and ignores client-supplied forwarding headers. If deployed behind a proxy, configure Express `trust proxy` for only your trusted proxy addresses in your deployment; otherwise users behind that proxy share a limit. Do not trust arbitrary `X-Forwarded-For` values.

Expired activation and rate-limit rows may be deleted by routine maintenance after their full 15-minute windows have elapsed. Keep any retention needed for operational auditing separately. Phone changes and lost-number recovery require a separate support process; phone possession alone does not establish a legal tenant identity.

## Database and verification

The additive migration `20261115T1041_tenant_sms_activation` advances `842d689...` to `993fd84...`. It adds `User.phoneVerifiedAt`, temporary activation state and shared request counters. It does not alter existing credentials or lease data.

From `backend`:

```sh
pnpm contract:emit
pnpm exec prisma db migrate --show --to 993fd84c83a060235618d0cef446577dfe8627357ee07d1b9bd2365556afe338
pnpm exec prisma db migrate --to 993fd84c83a060235618d0cef446577dfe8627357ee07d1b9bd2365556afe338 --yes
pnpm exec prisma db verify --strict
pnpm test:activation
```

`pnpm test` includes the deterministic gateway, service and HTTP tests. To run database concurrency and identity-preservation tests, explicitly set `TEST_DATABASE_URL` to a migrated PostgreSQL test database, then run `pnpm test:tenant-integration`. The activation suite uses randomly named fixtures, removes them afterwards, and never sends a real SMS. It skips without an explicit test URL.
