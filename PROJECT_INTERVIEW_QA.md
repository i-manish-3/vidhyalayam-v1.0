# Vidhyalayam Project Interview Questions and Answers

This document answers senior-level interview questions based on the Vidhyalayam codebase.

## Architecture

### 1. Explain the overall architecture of this school ERP and how the web app, mobile app, API routes, workers, and database fit together.

Vidhyalayam is a multi-tenant school ERP. The main web app is built with Next.js, React, TypeScript, Tailwind, Prisma, and PostgreSQL. It exposes REST-style API routes under `src/app/api`, stores business data in PostgreSQL through Prisma, and uses Zustand for client-side app state.

The mobile app is an Expo/React Native app for parent-facing workflows. It calls the same backend, but uses mobile-specific auth endpoints under `/api/mobile/auth`.

Long-running operations such as demand slip generation, notification delivery, and tenant exports are handled by BullMQ workers backed by Redis. This keeps API requests fast while background workers process heavier jobs.

### 2. Why does this project use `schoolId` on most models? What bugs can happen if one query forgets tenant scoping?

`schoolId` enforces tenant isolation. Each school is a separate tenant, so almost every row must belong to exactly one school.

If a query forgets `schoolId`, serious bugs can happen:

- One school may see another school's students, fees, exams, or attendance.
- A mutation may update or delete records from the wrong tenant.
- Reports may include cross-school data.
- Super-admin impersonation can accidentally leak data.

In a SaaS ERP, missing tenant scoping is a security bug, not just a data bug.

### 3. The web app uses Next.js App Router but also has Zustand-based page navigation. What are the pros and cons of that design?

Pros:

- Fast in-app navigation without full route transitions.
- Centralized page state through `src/lib/store.ts`.
- Useful for dashboard-style ERP screens where users move between many internal views.
- Easy to preserve selected entities such as selected student, class, or academic year.

Cons:

- Deep linking becomes harder.
- Browser history and refresh behavior need extra care.
- Large union types like `PageName` can become difficult to maintain.
- Access control must be handled manually per rendered page.
- It does not fully use the routing strengths of Next.js.

### 4. How would you separate domain logic from API route handlers in this project?

API route handlers should stay thin. They should handle auth, parsing, validation, and HTTP responses. Business rules should live in `src/lib` or feature-specific service files.

For example:

- Fee allocation logic belongs in `src/lib/fees.ts`.
- Demand slip generation belongs in `src/lib/fee-demand.ts`.
- Attendance mutation and audit logic could live in an attendance service.
- Auth credential and refresh logic already follows this pattern in `src/lib/auth-core.ts`.

This makes logic reusable, easier to test, and safer across web, mobile, and workers.

### 5. Which modules look most business-critical here, and how would you prioritize reliability for them?

The most critical modules are:

- Fees and payments
- Admissions and student records
- Attendance
- Exams and report cards
- Authentication and RBAC
- Tenant isolation

Reliability priorities should include database constraints, audit logs, transaction boundaries, idempotency for payments, role checks on every API, automated tests for sensitive flows, and production monitoring for failed jobs and payment retries.

### 6. How would you scale this SaaS if 500 schools used it daily?

I would scale in layers:

- Add database indexes around `schoolId`, `academicYear`, `studentId`, and status fields.
- Keep heavy jobs in BullMQ workers and scale workers horizontally.
- Cache relatively stable school settings and permissions carefully.
- Add monitoring for slow queries, failed jobs, and auth failures.
- Use connection pooling for PostgreSQL.
- Consider partitioning or archiving old audit and attendance records.
- Keep tenant isolation enforced in every query.

## Authentication and Security

### 7. Why does the web app use HttpOnly cookies while the mobile app uses bearer tokens in secure storage?

The web app uses HttpOnly cookies because browser JavaScript cannot read them, which reduces damage from XSS attacks. Cookies are automatically sent with requests.

The mobile app cannot rely on browser cookies in the same way, so it stores access and refresh tokens in Expo SecureStore and sends the access token in the `Authorization: Bearer` header.

The transport is different, but the underlying auth behavior should stay the same.

### 8. What is the purpose of sharing auth logic in `auth-core.ts` between web and mobile?

Shared auth logic prevents security drift. Login checks, account lockout, school suspension, token issuing, refresh token validation, token version checks, and audit logging should behave the same for web and mobile.

Only the transport differs:

- Web stores tokens in HttpOnly cookies.
- Mobile receives tokens in JSON and stores them securely.

### 9. Explain how refresh tokens, token rotation, and `tokenVersion` help invalidate sessions.

Access tokens are short-lived and used for API calls. Refresh tokens allow the client to get a new access token without logging in again.

The project rotates refresh tokens by issuing a new access and refresh pair during refresh. `tokenVersion` is stored on the user and embedded in tokens. When a password changes or sessions need to be invalidated, the user's `tokenVersion` can be incremented. Any older token with the old version is rejected.

### 10. How does account lockout work, and what edge cases should be tested?

Failed login attempts are recorded. If a non-super-admin user fails too many times, the account is temporarily locked. The API returns HTTP `423` with a retry time.

Important test cases:

- Wrong password repeatedly locks the account.
- Correct password after lockout is still rejected until lockout expires.
- Successful login resets failure count.
- Super admin lockout exemption works as intended.
- Deleted, inactive, and suspended-school users cannot log in.
- Login events are audited for both success and failure.

### 11. What is the risk of caching user metadata and permissions in localStorage?

localStorage can be read by JavaScript, so it is not safe for secrets. This project no longer stores web auth tokens in localStorage, which is good.

Caching user metadata and permissions is acceptable for faster UI rendering, but it must never be treated as the source of truth. The backend must enforce auth and permissions on every sensitive API request.

### 12. How should parent APIs ensure a parent can only access their own children's data?

Parent APIs should:

- Read the authenticated user from the token.
- Confirm the user role is `PARENT`.
- Query parent-child relationships through `Parent` or linking tables.
- Scope every query by `schoolId`.
- Filter requested child/student IDs against the authenticated parent's allowed children.

Never trust a `studentId` from the client without checking ownership.

### 13. How would you secure super-admin impersonation so it cannot leak cross-tenant access?

Impersonation should be explicit and audited. The effective `schoolId` should come from `impersonatingSchoolId`, not arbitrary request parameters.

Security rules:

- Only `SUPER_ADMIN` can start or stop impersonation.
- Every impersonated action should be logged.
- The UI should clearly show impersonation state.
- API helpers should consistently use the effective school ID.
- Super-admin-only endpoints should still distinguish real super admin from impersonated school admin context.

## RBAC and Permissions

### 14. Explain the difference between primary roles like `SCHOOL_ADMIN` and custom school roles.

Primary roles are broad identity categories stored on `User.role`, such as `SUPER_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, `PARENT`, `STUDENT`, and `STAFF`.

Custom school roles are permission groups inside a school, such as Accountant, Transport, Librarian, or custom staff roles. These are assigned through `UserRole` and linked to granular permissions.

### 15. Why does the system have school-level granted permissions before assigning role permissions?

School-level grants define which features are enabled for a tenant. Role permissions must stay within that grant.

This prevents a school role from receiving access to a module the platform has not enabled for that school. It supports SaaS feature gating and subscription-based access.

### 16. What are permission aliases, and what risk do they introduce?

Permission aliases map newer or more specific permission codes to older or broader ones. For example, `exam:create` can be accepted if the user has `exam:manage`.

They help preserve compatibility during permission refactors. The risk is accidentally granting broader access than intended if aliases are too permissive or poorly reviewed.

### 17. How would you design permission checks so UI hiding is never the only security layer?

The UI can hide buttons and pages for usability, but every API route must independently enforce:

- Authentication
- Role or permission checks
- Tenant scoping
- Entity ownership checks where needed

Backend checks are the source of truth. UI checks are only convenience.

### 18. How would you test that a teacher cannot access admin-only endpoints?

I would write API tests that authenticate as a teacher and call admin-only endpoints such as fee setup, school settings, role management, and tenant export. The expected result should be `403` or `401`.

I would also test direct URL/API access, not only UI visibility, because a user can manually call an endpoint.

## Database and Prisma

### 19. What does soft delete with `deletedAt` solve, and what problems can it create?

Soft delete preserves historical data and auditability. It also allows recovery from accidental deletes.

Problems:

- Queries must consistently filter `deletedAt: null`.
- Unique constraints may need special handling.
- Old records can pollute reports if not filtered.
- Data volume grows over time.

### 20. What indexes would you expect on a multi-tenant ERP database?

Useful indexes include:

- `schoolId`
- `schoolId, academicYear`
- `schoolId, studentId`
- `schoolId, classId, sectionId`
- `schoolId, status`
- `schoolId, date`
- `schoolId, receiptNumber`
- Auth-related indexes like email, phone, role, and active status

Indexes should match real query patterns from list pages, reports, and dashboard APIs.

### 21. Explain why fee structures are versioned instead of edited in place.

Fee structures are business records. If an admin changes the master fee setup, already assigned student fees should not silently change.

Versioning allows the school to keep historical structures, apply new structures going forward, and preserve the exact setup used when a student was assigned fees.

### 22. Why are student fee assignments stored as snapshots?

Snapshots protect student-level payable data from later master-data edits. A student's assigned fee items copy names, amounts, due dates, billing behavior, and metadata at the time of assignment.

This is important for auditability and fairness. A later fee structure change should not rewrite past student obligations unless an explicit reassignment or adjustment is made.

### 23. What should happen when a school changes its fee structure after students already have assigned fees?

Existing assignments should remain unchanged. The new fee structure should become a new active version for future assignments or explicitly selected reassignment flows.

If the school wants to update existing students, the system should use a controlled migration or adjustment flow with audit logs.

### 24. How would you safely migrate a large Prisma schema in production?

I would:

- Create reviewed migrations, not ad hoc schema pushes.
- Back up the database first.
- Run migrations in staging with production-like data.
- Avoid long blocking changes during peak hours.
- Add nullable fields first, backfill data, then enforce constraints later.
- Regenerate Prisma client and deploy app and workers together.
- Monitor errors and slow queries after deployment.

## Fees Module

### 25. Explain the difference between `FeesStructure`, `StudentFeeAssignment`, invoice rows, and `FeeCollection`.

`FeesStructure` is the reusable class or group fee template.

`StudentFeeAssignment` is the student's durable snapshot copied from a structure.

Invoice rows represent payable lines for that assignment.

`FeeCollection` is the compatibility and collection-facing demand/payment surface used by existing collection screens.

### 26. Why does the project still maintain a `FeeCollection` compatibility layer?

The project already had screens and APIs using `FeeCollection`. Instead of rewriting the entire fee collection UI at once, the newer invoice and assignment system mirrors data into `FeeCollection`.

This allows gradual migration while keeping existing workflows functional.

### 27. How does the payment allocation logic work when a parent pays partial dues?

The system finds open demand rows for the student or invoice and allocates payment from oldest open row to newest. Each row becomes `paid` or `partial` based on the remaining balance.

The payment is recorded, invoice totals are updated, and audit logs are written.

### 28. What concurrency bugs can happen when two cashiers collect fees for the same student?

Possible bugs:

- Duplicate receipt numbers
- Lost balance updates
- Overpayment or wrong remaining balance
- Invoice status overwritten by the last transaction
- Duplicate payment records from repeated submissions

### 29. How do unique receipt constraints and optimistic locking reduce duplicate or lost payments?

A unique constraint on `(schoolId, receiptNumber)` prevents duplicate receipt numbers at the database level.

Optimistic locking uses a `version` field on ledger entries. A transaction only updates the row if the version is unchanged. If another transaction updated it first, the update fails and the system retries.

Together, they preserve correctness under concurrent payments.

### 30. What would idempotency keys add to the payment flow?

An idempotency key lets the client safely retry the same payment request without creating duplicate payments.

This is especially useful for mobile networks, double-clicks, browser retries, or timeout scenarios where the client does not know whether the server committed the payment.

### 31. How would you design refund handling for refundable deposits?

I would add a refund workflow with:

- Refund eligibility based on refundable fee heads.
- Approval states such as requested, approved, rejected, paid, and voided.
- Ledger entries for refund liabilities and payments.
- Audit logs for every state change.
- Receipt or voucher generation.
- Permission checks for who can approve and who can pay.

## Attendance

### 32. Explain the finalize/reopen attendance workflow.

Attendance can be marked for a class and date. Once finalized, records are locked from normal editing. If correction is needed, an authorized user can reopen attendance with a reason, edit it, and finalize it again.

The flow creates audit records for accountability.

### 33. Why does reopening attendance require a reason?

Reopening changes an already finalized official record. A reason creates accountability and helps future admins understand why the record changed.

It is important for compliance, parent disputes, and internal review.

### 34. Why does the system keep `AttendanceChangeLog` instead of only overwriting attendance rows?

Overwriting attendance loses the previous value. `AttendanceChangeLog` records old status, new status, old remarks, new remarks, who changed it, and when.

This makes attendance corrections auditable and allows historical reconstruction.

### 35. How would you reconstruct historical attendance at a specific audit moment?

Start with current attendance and walk the change log around the audit timestamp. If a student has a change after the audit moment, use the `oldStatus` and old remarks to infer what the value was at that time. Otherwise, use the current value.

The project exposes this through the attendance snapshot API.

### 36. What should be tested around finalized attendance edits?

Tests should verify:

- Finalized attendance cannot be edited normally.
- Reopen requires permission.
- Reopen requires a reason.
- Edits after reopen create change-log rows.
- No-op edits do not create fake changes.
- Finalizing and reopening creates audit entries.
- Snapshot views are read-only.

## Background Jobs

### 37. Why are demand slips generated through BullMQ and Redis?

Bulk demand slip generation can take time for many students. BullMQ lets the API return immediately with a run ID while a worker processes the job in the background.

It also supports retries, progress tracking, and horizontal worker scaling.

### 38. What should happen if Redis is unavailable?

The system should either:

- Fall back to synchronous processing for smaller jobs, or
- Return a clear service-unavailable response for operations that require the queue.

The current design includes queue-enabled checks and synchronous fallback behavior for some flows.

### 39. How would you monitor failed jobs, stuck jobs, and retry rates?

I would monitor:

- BullMQ waiting, active, completed, and failed counts
- Job duration
- Retry count and failure reason
- Worker process health
- Redis connectivity
- Database errors during job execution

Alerts should fire for stuck active jobs, high failure rates, or workers not running.

### 40. What data should be stored in the database versus only in the queue job payload?

The database should store durable business state, such as run ID, status, counts, timestamps, generated slips, and error logs.

The queue payload should store processing inputs such as student IDs, month, year, force flag, and actor ID.

If Redis is lost, durable job history should still be visible in the database.

## Mobile App

### 41. How does the Expo app handle session bootstrap on launch?

On launch, the mobile auth store checks for an access token in SecureStore. If one exists, it calls `fetchMe()` and `fetchPermissions()`. If those calls succeed, the user becomes authenticated. If they fail, tokens are cleared and the user becomes unauthenticated.

### 42. Why does the mobile API client use single-flight refresh on `401`?

Many requests may fail with `401` at the same time when an access token expires. Single-flight refresh ensures only one refresh request is made. Other failed requests wait for that refresh result.

This avoids refresh storms and token race conditions.

### 43. How does the mobile app avoid logging out multiple times during parallel failed requests?

The API client has a shared unauthorized handler and single refresh promise. If refresh fails, it clears tokens and triggers the auth store once to move the app to unauthenticated state.

This keeps session-expiry behavior consistent even with many parallel requests.

### 44. What offline or poor-network behavior would you add for a parent app?

I would add:

- Cached last-known child profile, fees summary, attendance, and exam results.
- Clear offline banners.
- Retry for safe read requests.
- Local queue only for actions that are explicitly idempotent.
- Better handling for slow networks and expired sessions.

Payment-related flows should be especially careful and use idempotency.

### 45. How would you keep mobile and web API contracts from drifting?

I would:

- Share TypeScript types where possible.
- Use Zod schemas for request and response validation.
- Add contract tests for mobile endpoints.
- Keep shared auth and domain logic in backend services.
- Document API response shapes used by the mobile app.

## Frontend

### 46. How does Zustand support auth, school branding, academic year context, and notifications?

The global store keeps:

- Authenticated user metadata
- Permissions
- Current school branding
- Sidebar state
- Viewing academic year
- Page memory
- Live notification state

This lets different parts of the app react to global context without prop drilling.

### 47. What are risks of putting too much app state in one global store?

Risks include:

- A large store becomes hard to reason about.
- Unrelated components may re-render.
- State persistence can become inconsistent.
- Feature boundaries blur.
- Testing becomes harder.

Some state should remain local to pages or feature-specific stores.

### 48. How would you improve route-level deep linking in this app?

I would gradually move important entity pages to URL-backed routes or synchronize Zustand page state with URL query parameters.

For example:

- `/students/:id`
- `/attendance/view?date=...&classId=...`
- `/fees/invoices/:id`

This improves sharing links, refresh behavior, browser history, and debugging.

### 49. How should dynamic school branding be applied without breaking dark mode?

School branding should update semantic CSS variables like primary color and accent color. App components should use tokens such as `bg-primary`, `text-primary`, and `border-primary`.

Dark mode should keep accessible dark surfaces instead of blindly applying bright school colors everywhere.

### 50. How would you design loading, empty, and permission-denied states across modules?

I would standardize shared components for:

- Loading skeletons
- Empty states with clear next action
- Permission-denied messages
- Error retry states

Each module should use the same interaction pattern so users do not need to relearn behavior.

## Senior System Design

### 51. Design a safe tenant export feature for one school's full data.

The export should:

- Require super-admin permission.
- Create an `ExportJob` database row.
- Run in a background worker.
- Scope every exported query by `schoolId`.
- Write a compressed artifact to configured storage.
- Track status, progress, file size, and errors.
- Expire or restrict download links.
- Audit who requested and downloaded the export.

### 52. Design a notification system supporting in-app, email, WhatsApp, and mobile push.

I would split notification creation from delivery.

The core notification service creates an in-app notification and recipient rows. External channels are queued as delivery jobs. Workers send email, WhatsApp, SMS, web push, or mobile push, then update delivery status.

The system should support templates, preferences, retries, failure reasons, and per-channel rate limits.

### 53. How would you audit sensitive actions across fees, exams, attendance, and users?

Each sensitive module should write structured audit logs with:

- Actor user ID
- School ID
- Entity ID and entity type
- Action name
- Old values and new values when practical
- Reason, if required
- Timestamp
- Request metadata such as IP or user agent for auth events

Audit logs should be queryable by school, date range, actor, module, and action.

### 54. What observability would you add before production launch?

I would add:

- Structured application logs
- API latency and error-rate metrics
- Database slow-query monitoring
- Worker job metrics
- Auth failure and lockout monitoring
- Payment retry and failure alerts
- Uptime checks
- Error tracking with request context

### 55. If a school reports wrong fee balances, how would you debug from database records and audit logs?

I would:

1. Identify the student, school, academic year, and fee group.
2. Check the student's fee assignment snapshot.
3. Compare invoice lines with `FeeCollection` demand rows.
4. Review payment records, receipt numbers, allocations, discounts, concessions, fines, and refunds.
5. Check fee audit logs for manual changes.
6. Look for concurrent payment retries or failed transactions.
7. Recalculate expected balance from ledger entries and compare it with stored balances.

The goal is to find whether the issue came from setup, assignment, collection, concurrency, or later adjustment.

