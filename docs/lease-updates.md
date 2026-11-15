# Landlord lease updates

On the landlord **Leases** page, choose **Update** on an active lease. The drawer opens with the current rent, billing frequency, start/end dates, grace days and terms. Only changed fields are submitted. **Extend 12 months** fills the end date; **Save lease changes** applies it. Reopening the drawer displays saved values. Closed leases remain available for viewing.

## Business rules

- Rent, billing frequency and start date may change only before the original lease starts, using Nairobi's calendar date. An updated start date must also be in the future.
- Once a receipt exists, the financial schedule cannot be rewritten. Terms, grace days and end-date extensions remain available. Pending online checkouts also block financial schedule changes and future-term shortening until resolved.
- Ongoing agreements allow terms, grace days and end-date extensions. Use the separate termination action to end a lease early.
- The end date must follow the start date. Agreements may not exceed 50 years or overlap another active agreement for the same property, including their inclusive end dates.
- The landlord must be active and own both the lease and its property. Tenant, property and landlord IDs are immutable in this endpoint. Termination cannot be combined with other field changes.

The API rechecks these rules inside a transaction. It locks the property before the lease, matching creation's lock order; payment writers take the same lease lock. This prevents two otherwise valid simultaneous date edits from creating an overlap or a receipt racing a rent change. The lease update and billing recalculation commit together. Existing receipt IDs and references remain intact; canceled future bills are retained with zero charges and omitted from the active billing table. Extensions use the existing billing behavior, including recalculation of a partial final period.

## API

`PATCH /api/v1/landlord/leases/:id` accepts any nonempty subset of:

```json
{
  "rentAmount": "1250.50",
  "paymentPeriod": "QUARTERLY",
  "startDate": "2027-01-01",
  "expireDate": "2027-12-31",
  "gracePeriod": 7,
  "terms": "Updated agreement terms"
}
```

Use `{ "status": "TERMINATED" }` separately for termination. Success remains `{ "success": true }`. Validation errors return 400, unauthorized ownership returns 404, and conflicts such as schedule locks or overlapping agreements return 409. Authentication and inactive/non-landlord checks return 401/403. The endpoint is also available at `/api/v1/leases/:id` and `/api/v1/lease/:id`, and all three support the `/api` prefix.

The overview includes `businessDate` for the frontend's commencement checks. Backend validation is authoritative if the date changes while a form is open. After a successful update, the page reloads its lease and billing data. If the update succeeds but refreshing fails, it reports that the lease was saved and asks the user to reload.

No database schema migration is required.

## Calendar-date billing

Billing periods, proration, due dates and grace boundaries use calendar dates only. Time and offset components on lease/billing inputs do not affect the schedule. A period includes its entire end date; a bill becomes overdue on the calendar day after its final grace day (including when grace days are zero). The current business date uses `Africa/Nairobi`.

Landlord and tenant overview responses return billing `startPeriod` and `endPeriod` as `YYYY-MM-DD`. Existing database date/time columns remain compatible; native JavaScript `Date` values use their UTC date, matching the application's database encoding. Receipt and audit timestamps retain their time. Bills are allocated in date order with a stable ID tie-breaker for the same date.

## Verification

From `backend`, `pnpm test` covers validation, ownership and authentication for the route aliases. `pnpm test:lease-integration` runs PostgreSQL update, overlap, concurrent edit and receipt-preservation checks only when `TEST_DATABASE_URL` is explicitly set. It creates temporary fixtures and removes them afterwards.

For the optional browser pass, start the production frontend on port 3000, set `E2E_BROWSER=true`, and run the same integration suite with a migrated test database. The test starts its own API on port 3001; those ports must be free of other test APIs. It verifies save/reopen behavior and the fields locked for an ongoing lease through installed Edge/Chromium. Override the frontend origin with `E2E_APP_URL` or the browser executable with `BROWSER_PATH`. Screenshots are stored in ignored `backend/.e2e-artifacts`.
