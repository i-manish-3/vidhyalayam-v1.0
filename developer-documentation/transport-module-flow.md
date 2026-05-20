# Transport Module Flow

This document explains how the transport module currently works in code, including route/driver management, admission integration, and data persistence behavior.

## 1. Scope and Entry Points

Primary frontend pages:

- `src/features/transport/pages/transport-page.tsx`
- `src/features/transport/pages/add-transport-route-page.tsx`
- `src/features/transport/pages/edit-transport-route-page.tsx`
- `src/features/transport/pages/add-driver-page.tsx`

Primary backend APIs:

- `src/app/api/school/transport/routes/route.ts`
- `src/app/api/school/transport/routes/[id]/route.ts`
- `src/app/api/school/transport/drivers/route.ts`

Transport is also integrated into admission creation:

- `src/app/api/school/admissions/route.ts`
- `src/features/admissions/pages/admission-form-page.tsx`

## 2. Data Model (Prisma)

Defined in `prisma/schema.prisma`.

### 2.1 `TransportRoute`

Represents a route definition for one academic year.

Key fields:

- `schoolId`
- `routeName`
- `routeNumber`
- `academicYear` (format `YYYY-YYYY`)
- `feeMonths` (JSON string array, for example `["Apr","May"]`)
- `stops` (JSON string array of objects `{ name, fare }`)
- `driverName`, `driverPhone` (snapshot text values)
- `vehicleNumber`
- `fee` (stored, but route listing usually derives fee from stop fares)
- `isActive`, `deletedAt`

### 2.2 `TransportStopFare`

Normalized stop fare table used for year-specific fare lookup.

Key fields:

- `schoolId`
- `routeId`
- `academicYear`
- `stopName`
- `fare`
- `feeMonths` (JSON string array)
- `isActive`

Uniqueness:

- `@@unique([routeId, academicYear, stopName])`

### 2.3 `TransportAllocation`

Student transport assignment snapshot created during admission.

Key fields:

- `schoolId`
- `studentId`
- `routeId`
- `academicYear`
- `pickupPoint`, `dropPoint`, `stopName`
- `fareAmount`
- `feeMonths`
- `isActive`

Note: allocations are currently created during admission POST flow; there is no dedicated allocation CRUD API yet.

## 3. Navigation and UI Behavior

Sidebar transport menu is configured in `src/components/app-sidebar.tsx`:

- Routes
  - Create Route (`add-transport-route`)
  - Route List (`transport`)
- Drivers
  - Add Driver (`add-driver`)
  - Driver Directory (`drivers`)

Page mapping in `src/components/app-layout.tsx`:

- `transport` -> `TransportPage`
- `add-transport-route` -> `AddTransportRoutePage`
- `edit-transport-route` -> `EditTransportRoutePage`
- `add-driver` -> `AddDriverPage`
- `drivers` -> `TransportPage` (currently mapped to route list page, not a dedicated driver directory page)

## 4. Permissions and Roles

Transport APIs require both role and permission checks.

Routes API (`/transport/routes`):

- GET: role `SCHOOL_ADMIN|TEACHER|STAFF` + permission `transport:read`
- POST: role `SCHOOL_ADMIN|STAFF` + permission `transport:create`

Route by ID API (`/transport/routes/[id]`):

- PUT: role `SCHOOL_ADMIN|STAFF` + permission `transport:update`
- DELETE: role `SCHOOL_ADMIN|STAFF` + permission `transport:delete`

Drivers API (`/transport/drivers`):

- GET: role `SCHOOL_ADMIN|TEACHER|STAFF` + permission `transport:read`
- POST: role `SCHOOL_ADMIN|STAFF` + permission `transport:create`

## 5. Route Management Flow

## 5.1 Create Route (`POST /api/school/transport/routes`)

Validation rules enforced server-side:

- route name required
- route code required
- academic year required in `YYYY-YYYY`
- academic year must exist as an active school `AcademicYear`
- `feeMonths` must be non-empty and contain valid month abbreviations (`Jan`..`Dec`)
- at least one stop required
- each stop must have valid `name` and non-negative `fare`
- optional `driverId` must belong to active user in the same school with Transport role

On success:

1. Creates `TransportRoute` with `stops` and `feeMonths` as JSON strings.
2. Calls `syncStopFares(...)` to upsert `TransportStopFare` rows for the route/year.
3. Sets any existing stop fares for that route/year to inactive before upsert.

## 5.2 List Routes (`GET /api/school/transport/routes`)

Academic year behavior:

- If `academicYear` query param is provided, it is used.
- Otherwise, school current academic year is used (if valid format).

Response behavior:

- Fetches non-deleted routes (`deletedAt: null`) for school (and academic year when resolved).
- Includes `_count.allocations` of active allocations for the same year.
- If academic year is resolved, overlays stop fares from `TransportStopFare` into response:
  - `stops` becomes JSON of active stop fares for that year
  - `feeMonths` comes from stop fare rows
  - `fee` is returned as rounded average of stop fares for display

This is why UI fare values reflect stop fares rather than stored `TransportRoute.fee`.

## 5.3 Update Route (`PUT /api/school/transport/routes/[id]`)

Behavior:

- Verifies route belongs to school and is not soft-deleted.
- Supports partial update of route fields.
- Validates academic year/fee months/stops similarly to create.
- If `driverId` is provided, replaces `driverName` and `driverPhone` with selected driver's values.
- If `driverId` is explicitly set to null/empty from UI, route driver snapshot is cleared.

Stop fare synchronization triggers when any of these are updated:

- `stops`
- `feeMonths`
- `academicYear`

When triggered, `syncStopFares(...)` runs for the effective year.

## 5.4 Delete Route (`DELETE /api/school/transport/routes/[id]`)

This is a soft delete:

- sets `deletedAt = now()`
- sets `isActive = false`

It does not physically remove DB records.

## 6. Driver Management Flow

## 6.1 List Drivers (`GET /api/school/transport/drivers`)

Returns active users in same school having Transport role assignment.

Selected fields:

- `id`, `name`, `phone`, `avatar`, `dob`, `drivingLicenseNumber`

## 6.2 Create Driver (`POST /api/school/transport/drivers`)

Required fields:

- `name`, `dob`, `drivingLicenseNumber`, `phone`

Validation:

- DOB must parse to valid date
- optional photo must be base64 JPEG/PNG/WebP and < 1 MB
- phone must be unique within school
- driving license number must be unique within school

Creation flow:

1. Generate random default password.
2. Create `User` with role `STAFF`, `mustChangePassword = true`, and generated local email.
3. Assign user to `Transport` role via `assignUserToRoleByName(...)`.
4. Return driver details plus default password once in API response.

## 7. Admission Integration (Transport Assignment + Fee Rows)

Admission form transport fields:

- `transportRouteId`
- `transportStop`

Frontend behavior (`src/features/admissions/pages/admission-form-page.tsx`):

- Loads routes by selected academic year:
  - `GET /api/school/transport/routes?academicYear=...`
- Parses returned route `stops` and lets user pick stop from dropdown.
- If academic year changes and selected route is not available, route/stop are reset.

Backend behavior on admission create (`POST /api/school/admissions`):

1. Validates route+stop combination:
   - either both present or both blank
2. Resolves fare using `resolveTransportFare(...)`:
   - first from `TransportStopFare` for school+route+year+stop
   - fallback to legacy route `stops` JSON
3. Creates `TransportAllocation` for admitted student when route+stop selected.
4. Creates `FeeCollection` rows for each transport fee month:
   - `feeHeadName = "Transport Fee"`
   - `amount = stop fare`
   - `installmentName = month`
   - `paymentStatus = "unpaid"`

## 8. Student Module Integration

Student list (`GET /api/school/students`) reads transport route ID from linked admission and resolves route name for display.

Student update (`PATCH /api/school/students/[id]`) can update admission transport fields:

- `admission.transportRouteId`
- `admission.transportStop`

Important: this update currently does not auto-create/update/deactivate `TransportAllocation` or related transport `FeeCollection` rows.

## 9. Known Caveats in Current Implementation

1. No dedicated allocation lifecycle APIs.
- Allocation is created at admission time only.
- Route/stop changes after admission do not sync allocation history automatically.

2. Soft delete does not deactivate stop fares.
- Route delete marks route deleted, but existing `TransportStopFare` rows remain active.
- Admission fare resolution checks stop fares first, so stale stop fares can still be resolved if someone posts deleted route ID directly.

3. Driver data on routes is snapshot-based.
- Route stores `driverName/driverPhone` text, not `driverId` foreign key.
- Driver profile updates do not automatically propagate to existing route rows.

4. `drivers` page key is mapped to route list component.
- Sidebar has a Driver Directory item, but it currently opens `TransportPage`.

5. Transport fee rows are created directly in `FeeCollection` during admission.
- There is no reconciliation job yet to adjust those rows when transport assignment changes later.

## 10. Request/Response Shapes (Practical Examples)

Create route request:

```json
{
  "routeName": "City Center Route",
  "routeNumber": "TR-001",
  "academicYear": "2026-2027",
  "feeMonths": ["Apr", "May", "Jun"],
  "driverId": "cm...",
  "stops": [
    { "name": "Main Chowk", "fare": 1200 },
    { "name": "Railway Colony", "fare": 1500 }
  ]
}
```

Create driver request:

```json
{
  "name": "Ramesh Kumar",
  "dob": "1990-08-14",
  "drivingLicenseNumber": "DL0420110012345",
  "phone": "9876543210",
  "photo": "data:image/jpeg;base64,..."
}
```

Admission payload transport snippet:

```json
{
  "academicYear": "2026-2027",
  "transportRouteId": "cm...",
  "transportStop": "Main Chowk"
}
```

## 11. End-to-End Sequence (Current)

```txt
Create Driver (optional)
  -> POST /transport/drivers

Create Route
  -> POST /transport/routes
  -> TransportRoute created
  -> TransportStopFare synced

Admission with Transport
  -> Admission form fetches routes by academic year
  -> User selects route + stop
  -> POST /admissions
     -> fare resolved from TransportStopFare
     -> TransportAllocation created
     -> monthly Transport FeeCollection rows created

Transport List UI
  -> GET /transport/routes
  -> route list with active allocation count + fare overlay from stop fares
```
