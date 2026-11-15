# Tenant lookup, lease binding and tenant access

Users are global phone identities. A landlord's customer roster is derived exclusively from that landlord's leases, including terminated and expired agreements. There is no public tenant directory or landlord endpoint for searching unbound users.

`User.role` is `LANDLORD` or `TENANT`; the existing `ADMIN` role remains for platform administration. A lease stores `landlordId` and `tenantUserId`, which references `User.id` directly. A composite foreign key also requires the lease's property and landlord to match. The former `Tenant` profile table is removed. New user and lease IDs are UUID strings; existing IDs remain unchanged.

## Create a lease

`POST /api/leases` requires an active landlord's bearer session. `/api/v1/leases`, `/api/v1/lease` and `/api/v1/landlord/leases` use the same binding service.

```json
{
  "propertyId": "property-uuid",
  "tenantName": "Abebe Bekele",
  "tenantPhone": "0911234567",
  "amount": "5000.00",
  "paymentPeriod": "MONTHLY",
  "startDate": "2026-11-01",
  "expireDate": "2027-10-31",
  "gracePeriod": 5,
  "terms": ""
}
```

`rentAmount` is also accepted. Amounts are positive monthly ETB rent, limited to two decimal places. Billing frequency defaults to monthly and grace defaults to five days. The end date is inclusive and must follow the start date. Caller-supplied landlord IDs, user IDs and statuses cannot choose the binding.

`handleLeaseTenantBinding(landlordId, propertyId, tenantName, tenantPhone, leaseDetails)` validates the input and runs one database transaction:

1. Validate the active landlord, lock their active property, and reject overlapping active leases.
2. Upsert the canonical phone against its unique index. An existing global user keeps their name, role, password and activation state. An unknown phone creates a `TENANT` user with a null password and `UNINITIALIZED` authentication state.
3. Create the owned lease and its billing periods, then commit. Any failure rolls back the placeholder, lease and bills together.

Concurrent bindings for the same phone reuse its user ID. Concurrent overlapping leases for one property serialize on the property row. Ethiopian local numbers such as `0911234567`, international forms such as `+251911234567`, and `00` international prefixes normalize to E.164. Other international numbers are supported for existing platform users.

## Landlord roster

`GET /api/landlords/:id/tenants` returns `{ "tenants": [...] }` with only `id`, `name` and `phone`. The path ID must equal the authenticated landlord ID. The overview and metrics use the same lease boundary. A tenant may belong to several landlords, but each landlord sees only their own agreements and payments.

The legacy `POST /api/v1/landlord/tenants` accepts `{ "phone": "..." }` solely to find an already-bound customer. Unrelated registered users and unknown phones both return the same 404. It never reserves a phone independently of a lease.

## Claim a reserved phone and sign in

For the frontend activation flow, tenants use **Activate tenant account** to verify an SMS code and set a password on their existing user. Local development uses a mock SMS gateway that prints random codes in the backend terminal. See [tenant activation](tenant-activation.md) for setup, delivery adapters and safeguards. The trusted-verifier endpoint below remains a separate passwordless integration.

Placeholder passwords are null and cannot pass password authentication. Public registration cannot overwrite a reserved identity. A trusted phone/OTP verifier can issue a short-lived signed proof after verifying possession of the phone. Exchange it at `POST /api/auth/tenant/login`:

```json
{ "phone": "0911234567", "verificationToken": "<signed-phone-proof>" }
```

Configure `TENANT_PHONE_VERIFICATION_SECRET` independently of `JWT_SECRET_KEY`. The proof must use HS256 and include:

| Claim | Required value |
| --- | --- |
| `sub` | Canonical phone, e.g. `+251911234567` |
| `purpose` | `tenant-phone-login` |
| `iss` | `digirent-phone-verifier` |
| `aud` | `digirent-tenant-login` |
| `iat`, `exp` | Issued now, expires within five minutes |

The server rejects expired, wrong-purpose, wrong-phone and session-key-signed proofs. It changes the original placeholder to `PHONE_VERIFIED` and issues the normal expiring `userId` session, preserving every lease link. Existing disabled accounts remain disabled. Other business roles keep their existing login credentials; binding them does not grant a new authentication method. With no verifier secret, phone login returns 503. This module validates verifier tokens; it does not send SMS or expose an endpoint that manufactures verification proofs.

## Tenant portal

`GET /api/tenant/portal` uses the bearer session's user ID, never a phone or tenant ID supplied in the URL or body. It returns currently effective active leases, their properties, landlord contact details, billing periods with payment status, receipts, notifications and checkouts. All financial data is restricted to those lease IDs. An existing user with another global role can access their own bound rental data without changing that role.

With no active agreements, a tenant receives empty data and:

> You currently have no active rental agreements linked to this phone number.

The dashboard displays this message. The authenticated `/tenant/overview` endpoint retains the tenant's own historical agreements for rental information and payment history.

## Migration

The generated migration `20261113T1442_tenant_lease_binding` upgrades storage hash `3e272666907dafd5c69639ebb476ad28403e35dc1c460566387adc888b18aff5` to `842d689fc98c85c230a859660307a40623024b33d1ae47ebb6ca0d570dbe08a6`. It renames tenant-link columns without losing their values, derives landlord ownership from properties, migrates global roles, and adds indexes and foreign keys. Existing creation timestamps default to the migration time because the old schema had no creation timestamp.

It stops and rolls back if normalizing phones would merge accounts or if a stored number is invalid. Reconcile those identities explicitly before retrying. The migration package is prepared; it is not automatically applied to `DATABASE_URL`.

From `backend`, regenerate the contract and review/apply the package before starting the updated server:

```sh
pnpm contract:emit
pnpm exec prisma db migrate --show --to 842d689fc98c85c230a859660307a40623024b33d1ae47ebb6ca0d570dbe08a6
pnpm exec prisma db migrate --to 842d689fc98c85c230a859660307a40623024b33d1ae47ebb6ca0d570dbe08a6 --yes
```

Fresh databases can initialize the current contract with `pnpm exec prisma db init`. Migration edits and backfills follow Prisma's [migration API](https://www.prisma.io/docs/orm/reference/migration-api).

## Verification

`pnpm test` covers reservation, normalized phones, reuse of existing identities, rollback on billing failure, overlap rejection, roster isolation, HTTP authentication, ignored client identity fields, phone proofs and the portal empty state using deterministic fixtures.

For actual PostgreSQL concurrency, foreign-key and rollback checks, first migrate a dedicated test database, set `TEST_DATABASE_URL`, then run `pnpm run test:tenant-integration`. It never falls back to the application's `DATABASE_URL`; it skips when no test URL is supplied. Its fixtures are removed afterwards. The normal unit suite never connects to the database.
