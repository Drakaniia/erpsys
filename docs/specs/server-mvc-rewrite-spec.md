# Server MVC Rewrite Spec

Status: approved for implementation planning
Scope: `apps/server` restructure, plus minimum `apps/web` decoupling
Owner: repository maintainer
Date: 2026-10-21

## 1. Purpose

Restructure the existing, working `apps/server` codebase into a conventional
Node/Express MVC layout so the system can be defended in an academic defense:
thin controllers, explicit models, grouped routes, and services that carry the
business rules.

This is a **restructure**, not a rebuild. Feature behavior and the HTTP contract
stay frozen. The internal shape is free to change.

Success is measured by four things:

1. The API answers exactly as it does today.
2. The existing tests pass, reorganized to mirror the new layers.
3. Every feature remains reachable from the UI.
4. The folder structure reads as a textbook MVC application without requiring
   knowledge of the current codebase.

## 2. Non-goals

- No new features, no endpoint redesign, no response-shape changes.
- No change to MongoDB collections, indexes, or document shapes.
- No change to Better Auth, Google OAuth, Turnstile, R2, or Cloudflare AI
  behavior.
- No deployment change. Nginx, systemd, port `3001`, and single-origin serving
  stay as they are.
- No architecture docs, diagrams, or presentation material. The code is the
  artifact. This spec and its parity checklist are the only planning documents.
- No microservices, repositories, DTO mapping libraries, ORMs, or dependency
  injection container.

## 3. Decisions

| Decision               | Choice                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meaning of rewrite     | Restructure existing logic into MVC; no greenfield behavior                                                                                                                                                                                                                                                |
| Feature scope          | Full parity across the entire server surface                                                                                                                                                                                                                                                               |
| Language               | TypeScript, NodeNext, strict, ESM `.js` import specifiers                                                                                                                                                                                                                                                  |
| External contract      | Frozen: same paths, same payloads, same error envelopes                                                                                                                                                                                                                                                    |
| Internal contracts     | Free: file names, signatures, helper boundaries                                                                                                                                                                                                                                                            |
| Controller/model style | Classes with methods                                                                                                                                                                                                                                                                                       |
| Controller size        | Thin: parse, call one service, shape response                                                                                                                                                                                                                                                              |
| Business logic         | Service classes in `services/<resource>/`, one use case per service                                                                                                                                                                                                                                        |
| Data access            | Raw `mongodb` driver inside models                                                                                                                                                                                                                                                                         |
| Model methods          | Static methods (for example `StudentProfileModel.findByUser`)                                                                                                                                                                                                                                              |
| Model granularity      | One model per collection by default; aggregate models only when a shared data shape earns one                                                                                                                                                                                                              |
| Read/query logic       | All of `lib/queries` becomes services                                                                                                                                                                                                                                                                      |
| Domain rules           | Constants to `src/config`, behavioral rules to the owning service                                                                                                                                                                                                                                          |
| Grouping key           | URL resource: the first path segment (`students`, `queues`, `departments`, …)                                                                                                                                                                                                                              |
| Folder layout          | One folder per resource in each of `routes/`, `controllers/`, and `services/`, with the same folder name in all three                                                                                                                                                                                      |
| Routes                 | One `express.Router` per resource folder in `routes/<resource>/index.ts`, mounted in `src/routes/index.ts`                                                                                                                                                                                                 |
| Controller grouping    | By resource folder, not by domain concept; a controller may serve both admin and self paths for its resource                                                                                                                                                                                               |
| Self-service paths     | `/me/*` lives in the resource folder it touches: `/me/student`, `/me/record`, `/me/assessment` → `students`; `/me/queue` → `queues`; `/me/enrollments` → `enrollments`; `/me/availability` → `advisers`; `/me/evidence-link`, `/me/steps/:code/submission` → `evidence`; `/me/departments` → `departments` |
| Personal paths         | `me` folder keeps only paths owned by no resource: `/me/launch`, `/me/overview`, `/me/stamp`, `/me/notifications`                                                                                                                                                                                          |
| Errors                 | `catchAsync` wrapper plus one global error handler; no per-handler try/catch                                                                                                                                                                                                                               |
| Views                  | Explicit serializers only for launch, queue, report, and student-record payloads                                                                                                                                                                                                                           |
| `src/lib`              | Survives only for non-MVC infrastructure; business logic moves out                                                                                                                                                                                                                                         |
| Auth                   | Better Auth config in `src/config/auth.ts`, session logic in `AuthService`, guards in `src/middleware`                                                                                                                                                                                                     |
| Integrations           | Better Auth, Cloudflare AI, R2, Turnstile wrapped in service classes                                                                                                                                                                                                                                       |
| Tests                  | Kept and adapted, moved to a mirrored `tests/` tree                                                                                                                                                                                                                                                        |
| File size              | Soft cap of 200 lines per file                                                                                                                                                                                                                                                                             |
| Cross-app coupling     | Server export map removed; web imports nothing from the server                                                                                                                                                                                                                                             |
| Web types/constants    | Copied verbatim into `apps/web/src/lib/domain`                                                                                                                                                                                                                                                             |
| Web dependency         | `@erpsys/server` removed from `apps/web/package.json`                                                                                                                                                                                                                                                      |
| Bug policy             | Fix obvious bugs found during migration and record each fix                                                                                                                                                                                                                                                |
| Baseline               | Commit and tag the current tree before any rewrite                                                                                                                                                                                                                                                         |
| Sequencing             | Resource by resource, green at every step                                                                                                                                                                                                                                                                  |
| Parity proof           | Typecheck, tests, UI click-through, and a ticked endpoint checklist                                                                                                                                                                                                                                        |
| Time budget            | One month or more                                                                                                                                                                                                                                                                                          |

## 4. Current state

Measured before planning:

- `apps/server/src`: 209 TypeScript files, about 34,661 lines.
- `apps/server` dependencies: `express`, `mongodb`, `better-auth@1.6.27`,
  `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `dotenv`, `zod@4`.
- Entry points: `src/index.ts` (boot, DB ping, indexes, sweeps, shutdown) and
  `src/app.ts` (`buildApp()` middleware and route composition).
- Routes register directly on the Express app through `registerX(app)` functions
  under `src/routes/v1/`.
- `src/lib/queries` holds cross-collection read logic. `src/lib/domain` holds
  constants and rules. `src/lib/platform` holds infrastructure.
- 23 Mongo collections are declared in `lib/db/db.ts`.
- 98 REST method/path pairs are registered under `/api/v1` by direct
  `app.<method>()` calls (plus any mount-level aliases), plus infrastructure endpoints
  (`/api/health`, `/api/ready`, `/api/metrics`, `/api/auth/*`, `/api/events`,
  `/api/chat/stream`, `/openapi.json`, `/docs`).
- The web client already has the frozen route table in
  `apps/web/src/lib/api-routes.ts`.
- The repository has no commits yet; all files are staged. A baseline commit
  and tag must exist before the first move.

## 5. Target architecture

### 5.1 Folder tree

```text
apps/server/src/
  index.ts                     boot sequence, unchanged in behavior
  app.ts                       buildApp(): composes config, middleware, routes
  config/
    constants.ts               step codes, year levels, labels, patterns
    roles.ts                   role matrix, surface ids, landing rules
    errors.ts                  ApiError and error codes
    auth.ts                    Better Auth configuration
    auth/
      StudentSignUpPlugin.ts   Better Auth plugin factory
  routes/
    index.ts                   mounts every resource router
    academic-years/index.ts
    advisers/index.ts
    auth/index.ts
    chat/index.ts
    content/index.ts
    departments/index.ts
    enrollments/index.ts
    evidence/index.ts
    integrations/index.ts
    me/index.ts
    queue-shares/index.ts
    queues/index.ts
    reports/index.ts
    requirements/index.ts
    storage/index.ts
    students/index.ts
    submissions/index.ts
    system/index.ts
    transfers/index.ts
    users/index.ts
  controllers/
    academic-years/AcademicYearsController.ts
    advisers/AdvisersController.ts
    auth/AuthController.ts
    chat/ChatController.ts
    content/ContentController.ts
    departments/DepartmentsController.ts
    enrollments/EnrollmentsController.ts
    evidence/EvidenceController.ts
    integrations/IntegrationsController.ts
    me/MeController.ts
    queue-shares/QueueSharesController.ts
    queues/QueuesController.ts
    reports/ReportsController.ts
    requirements/RequirementsController.ts
    storage/StorageController.ts
    students/StudentsController.ts
    submissions/SubmissionsController.ts
    system/SystemController.ts
    transfers/TransfersController.ts
    users/UsersController.ts
  services/
    academic-years/  AcademicYearService.ts
    advisers/        AdviserAvailabilityService.ts, AdviserService.ts
    auth/            AuthService.ts, SignUpService.ts
    chat/            ChatStreamService.ts
    content/         ContentService.ts
    departments/     DepartmentService.ts, DepartmentTakeoverService.ts
    enrollments/     EnrollmentService.ts, EnrollmentCompletionService.ts
    evidence/        EvidenceService.ts, StepSubmissionService.ts
    integrations/    IntegrationSettingService.ts
    me/              LaunchService.ts, OverviewService.ts, NotificationService.ts
    queue-shares/    QueueShareService.ts
    queues/          QueueJoinService.ts, QueueServingService.ts, QueueRevertService.ts, QueueListingService.ts, QueueRemovalService.ts
    reports/         ReportService.ts
    requirements/    RequirementService.ts
    storage/         StorageSessionService.ts, StorageContentService.ts
    students/        StudentProfileService.ts, StudentStepService.ts, StudentRecordService.ts, StudentAssessmentService.ts, StudentDirectoryService.ts
    submissions/     SubmissionReviewService.ts
    system/          MetricsService.ts
    transfers/       TransferService.ts
    users/           UserAdminService.ts
  models/
    <Collection>Model.ts       one per collection, flat, not per resource
  middleware/
    catchAsync.ts
    auth.ts                    requireSession, requireSurface, Turnstile
    http.ts                    parseBody, parseQuery, okOne, okList
    errorHandler.ts
    notFound.ts
    spaFallback.ts
    requestLog.ts
    rateLimit.ts
  views/
    LaunchView.ts
    QueueView.ts
    ReportView.ts
    StudentRecordView.ts
  lib/                         infrastructure only, see 5.9
```

Rules:

- The three layers use identical resource folder names: `routes/<resource>/`,
  `controllers/<resource>/`, `services/<resource>/`. A resource exists in all
  three or in none; no empty folders are scaffolded ahead of its phase.
- Folder name is the resource's first path segment, kebab-case. `content` is
  the one bundle: `/profiling-form`, `/social-links*`, `/chatbot-knowledge`,
  and `/signup-options` share no segment but are one content surface.
- Models, views, middleware, config, and `lib` stay flat. Models are shaped by
  collection, not by resource, because several resources share a collection
  (`student_profile` is read by students, enrollments, queues, and reports).
- `/me/*` handlers sit in the resource folder they touch. `controllers/me/`
  holds only launch, overview, stamp, and notifications, which belong to no
  other resource. There is no router or controller that composes another
  resource's handlers for `/me`.
- `routes` may import controllers, middleware, and config.
- `controllers` may import services, views, middleware helpers, and config.
- `services` may import models, `lib` infrastructure, and config.
- `models` may import `lib/db` and config.
- `lib` imports neither controllers, services, models, routes, nor views.
- No controller talks to Mongo directly. No route contains logic. No model
  contains HTTP concerns.
- Import the concrete module; never add barrel `index.ts` files except
  `routes/index.ts`, which is a mounted route table.

### 5.2 File and naming conventions

- Folders: kebab-case resource names, identical in the three layers:
  `routes/students/`, `controllers/students/`, `services/students/`.
- Files: PascalCase with a layer suffix: `StudentsController.ts`,
  `QueueServingService.ts`, `StudentProfileModel.ts`, `LaunchView.ts`.
- Classes: same name as the file. One exported class per file.
- Route entry: `routes/<resource>/index.ts`, exporting
  `const <resource>Router = Router()` (`studentsRouter`, `queuesRouter`, …).
  That `index.ts` is a route table, not a re-export barrel, and is the only
  `index.ts` allowed besides `routes/index.ts`. Controllers and services are
  imported through their concrete files; there are no
  `controllers/<resource>/index.ts` or `services/<resource>/index.ts` barrels.
- A resource folder may grow a second controller or service when the 200-line
  cap forces a split; both files stay in that resource's folder.
- Methods: verb-first (`list`, `getOne`, `create`, `update`, `remove`,
  `serve`, `revert`, `complete`).
- Handlers are arrow-function class properties so router binding does not need
  `.bind(this)`.
- Tests: `<Subject>.test.ts` under
  `apps/server/tests/<layer>/<resource>/`, mirroring the source path.

### 5.3 Models

One model per collection. Static methods only; no instances and no state.

```ts
export class StudentProfileModel {
  static async findByUser(userId: string): Promise<StudentProfile | null> { ... }
  static async updateByUser(userId: string, patch: StudentProfilePatch): Promise<void> { ... }
}
```

- Use `COLLECTIONS` and `getDbSync()` from `lib/db/db.ts`.
- Reuse `idForms` / `idIn` and `genId` so legacy string ids keep working.
- Models return raw documents or small typed projections. They do not throw
  HTTP errors; they return `null`, counts, or document arrays.
- Default aggregation pipeline stages needed by several services may live in a
  model method. A query used by exactly one use case lives in that service.
- Do not create a model for `admin_activity` unless the collection is confirmed
  present; use the existing activity helpers as the source of truth.

### 5.4 Services

One class per use case, in the folder of the resource that owns the data.

Examples:

- `services/auth/AuthService.ts` — session lookups and role checks.
- `services/auth/SignUpService.ts` — student sign-up plugin writes.
- `services/students/StudentProfileService.ts`
- `services/students/StudentStepService.ts`
- `services/students/StudentRecordService.ts`
- `services/me/LaunchService.ts`
- `services/queues/QueueJoinService.ts`
- `services/queues/QueueServingService.ts`
- `services/queues/QueueRevertService.ts`
- `services/queue-shares/QueueShareService.ts`
- `services/storage/StorageSessionService.ts`
- `services/storage/StorageContentService.ts`
- `services/reports/ReportService.ts`
- `services/chat/ChatStreamService.ts`

Rules:

- A service used by several resources lives with the resource that owns the
  data (`DepartmentService` in `services/departments/`, `QueueShareService` in
  `services/queue-shares/`). Callers import that concrete file; they do not
  duplicate the query.
- A service never imports a controller or a route.
- A service method takes explicit inputs (ids, parsed input, actor) and returns
  plain data or a typed view model.
- A service throws `ApiError` for expected failure states. Models and `lib`
  throw only infrastructure errors.
- Cross-collection reads live in the service that owns the use case.
- Services never receive `Request` or `Response`.
- Split at 200 lines; a service that outgrows the cap becomes two use-case
  services, not a god service.
- `lib/queries` modules are dissolved into these services. No `lib/queries`
  directory remains.

### 5.5 Controllers

One folder per resource, mirroring the routes folders. A frozen path such as
`/api/v1/me/queue` is owned by `controllers/queues/QueuesController.ts` and
`/api/v1/me/enrollments` by `controllers/enrollments/EnrollmentsController.ts`.
The owning resource's router declares its `/me/...` path next to its admin
paths, so no router composes another resource's handlers.

Target controllers:

| Folder           | Controller                | Owns                                                                                                                                                                       |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic-years` | `AcademicYearsController` | `/academic-years`, `/academic-years/:id`, `/academic-years/:id/activation`                                                                                                 |
| `advisers`       | `AdvisersController`      | `/advisers`, `/advisers/:adviserId`, `/me/availability`, `/me/availability/heartbeat`                                                                                      |
| `auth`           | `AuthController`          | `/api/auth/*`, Google sign-in guard                                                                                                                                        |
| `chat`           | `ChatController`          | `/api/chat/stream`                                                                                                                                                         |
| `content`        | `ContentController`       | `/profiling-form`, `/social-links`, `/social-links/:id`, `/social-links/order`, `/chatbot-knowledge`, `/signup-options`                                                    |
| `departments`    | `DepartmentsController`   | `/departments`, `/departments/:id`, `/departments/:id/takeover`, `/departments/:id/year-levels`, `/departments/:id/enrollments`, `/me/departments`                         |
| `enrollments`    | `EnrollmentsController`   | `/me/enrollments`, `/enrollments/:id/completion`, `/enrollments/completions`                                                                                               |
| `evidence`       | `EvidenceController`      | `/evidence`, `/evidence/:id`, `/me/evidence-link`, `/me/steps/:code/submission`                                                                                            |
| `integrations`   | `IntegrationsController`  | `/integrations`, `/integrations/:key`                                                                                                                                      |
| `me`             | `MeController`            | `/me/launch`, `/me/overview`, `/me/stamp`, `/me/notifications`, `/me/notifications/read`                                                                                   |
| `queue-shares`   | `QueueSharesController`   | `/queue-shares`, `/queue-shares/:token`                                                                                                                                    |
| `queues`         | `QueuesController`        | `/me/queue`, `/queues`, `/queues/serving`, `/queues/serving/position`, `/queue-entries/:id/removal`, `/queue-entries/:id/restoration`                                      |
| `reports`        | `ReportsController`       | `/reports/roster`, `/reports/roster-stats`, `/reports/step-register`, `/reports/user-directory`                                                                            |
| `requirements`   | `RequirementsController`  | `/requirements`, `/requirements/:id`, `/requirements/order`                                                                                                                |
| `storage`        | `StorageController`       | `/storage/session`, `/storage/complete`, `/storage/session-status`, `/uploads/:id/content`                                                                                 |
| `students`       | `StudentsController`      | `/students`, `/students/:id`, `/students/:id/record`, `/students/:id/mugshot`, `/students/reminders`, `/me/student`, `/me/student/profile`, `/me/record`, `/me/assessment` |
| `submissions`    | `SubmissionsController`   | `/submissions`, `/submissions/:verificationId`, verification, replies, revoke                                                                                              |
| `system`         | `SystemController`        | `/api/health`, `/api/ready`, `/api/metrics`, `/api/events`, `/openapi.json`, `/docs`                                                                                       |
| `transfers`      | `TransfersController`     | `/transfers`, `/transfers/:id`                                                                                                                                             |
| `users`          | `UsersController`         | `/users`, `/users/:userId`, bulk role/delete, `/users/:userId/password-reset`                                                                                              |

Controller rules:

- Parse and validate input with existing Zod schemas.
- Call exactly one service per handler. If a handler needs two service calls,
  the second belongs inside the first service or a use-case service.
- Shape output through `okOne` / `okList`, or through a view for the four
  complex payloads.
- Wrap handlers in `catchAsync`; no local try/catch except where streaming or
  socket handling requires it.
- No Mongo imports, no integration clients, no business branches.
- A controller's self paths and admin paths may need different guards. The
  guard belongs on the route, not on the controller, so one resource
  controller can serve `/students` for officers and `/me/student` for the
  student.
- Split at 200 lines along use-case boundaries, keeping the extra controller in
  the same resource folder (`controllers/students/StudentRecordController.ts`
  beside `StudentsController.ts`).

### 5.6 Views

Views are pure functions that turn service output into the exact wire shape.
They exist only where payload shaping is genuinely complex, and they stay flat
in `views/` rather than per resource: `QueueView` serves both `queues` and
`queue-shares`, and `StudentRecordView` serves both `students` and `/me/record`.

- `LaunchView.ts` — role-specific launch payloads.
- `QueueView.ts` — queue listing, queue entry, serving, share payloads.
- `ReportView.ts` — roster, stats, step register, user directory.
- `StudentRecordView.ts` — the full student record.

Everything else uses `okOne` / `okList` and returns the service result directly.

### 5.7 Routes

- One folder per resource under `routes/`, each with an `index.ts` that
  exports `const <resource>Router = Router()`: `academic-years`, `advisers`,
  `auth`, `chat`, `content`, `departments`, `enrollments`, `evidence`,
  `integrations`, `me`, `queue-shares`, `queues`, `reports`, `requirements`,
  `storage`, `students`, `submissions`, `system`, `transfers`, `users`.
- Every resource router declares its full path set relative to `/api/v1`,
  including its own `/me/...` paths, and is mounted exactly once at `/api/v1`
  from `routes/index.ts`. A router never mounts another resource's router.
- Example, `routes/students/index.ts`: `/students`, `/students/reminders`,
  `/students/:id`, `/students/:id/record`, `/students/:id/mugshot`,
  `/me/student`, `/me/student/profile`, `/me/record`, `/me/assessment`.
- `auth`, `system`, `chat`, and docs routers mount at the app level under
  `/api` or the root, as today.
- Preserve mount order across routers exactly where paths overlap, and keep
  literal paths ahead of parameterised ones inside a router
  (`/students/reminders` before `/students/:id`).
- Use existing middleware order: CORS, request logging, rate limits, static
  serving, auth handler, specific guards, API routers, SPA fallback, not-found,
  error handler.
- Better Auth's `/api/auth/*splat` handler stays raw. The literal
  `/api/auth/sign-in/social/google` guard is registered before it.

### 5.8 Middleware

- `auth.ts` exports `requireSession`, `requireSurface`, the Google sign-in
  guard, and the Turnstile verification middleware.
- `http.ts` exports `parseBody`, `parseQuery`, `okOne`, `okList`, and any
  response envelope helpers currently in `lib/platform/http.ts`.
- `catchAsync.ts` is the only async error wrapper.
- `errorHandler.ts` preserves status codes, `{ error }` shapes, and messages.
- `notFound.ts` returns JSON for `/api/*` and falls through elsewhere.
- `spaFallback.ts` keeps `SERVE_WEB` behavior and the static build path.
- `requestLog.ts` and `rateLimit.ts` wrap the existing `lib/platform` modules.

### 5.9 `src/lib` survivors

`src/lib` remains, but only for infrastructure that is not an MVC layer:

| Area                          | Retained modules                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB connection and collections | `lib/db/db.ts`, `lib/db/ids.ts`                                                                                                                     |
| Indexes and maintenance       | `lib/db/indexes.ts`, `lib/db/sweeps.ts`, `lib/db/queue-repair.ts`, `lib/db/queue-audit.ts`, `lib/db/user-purge.ts`, `lib/db/notification-writes.ts` |
| Environment                   | `lib/platform/env.ts`                                                                                                                               |
| Observability and resilience  | `metrics.ts`, `request-log.ts`, `rate-limit.ts`, `readiness.ts`, `shutdown.ts`, `openapi.ts`, `sse.ts`, `guard.ts`                                  |
| Storage integration           | `lib/storage` R2 client, presigning, quota counters                                                                                                 |
| Chat integration              | `lib/chat` Cloudflare client, model routing, knowledge, token budget                                                                                |
| Integration settings          | `lib/platform/integration-settings.ts`, `profiling-form.ts`, `turnstile.ts`                                                                         |

Everything else in `lib` is dissolved:

| Current module                          | Destination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/domain/domain.ts` constants        | `config/constants.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `lib/domain/roles.ts`                   | `config/roles.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lib/domain/academic-year.ts`           | `AcademicYearService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `lib/domain/availability.ts`            | `AdviserAvailabilityService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `lib/domain/department-availability.ts` | `DepartmentService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/domain/department-identity.ts`     | `DepartmentService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/domain/enrollment.ts`              | `EnrollmentService` and request schemas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/domain/evidence-expiry.ts`         | `EvidenceService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lib/domain/profile-status.ts`          | `StudentProfileService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/domain/queue-share.ts`             | `QueueShareService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/domain/student-number-claim.ts`    | `SignUpService` and `StudentProfileService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `lib/domain/student-steps.ts`           | `StudentStepService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/domain/transfer-schemas.ts`        | `TransferService` and request schemas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `lib/queries/*`                         | The owning service: department listing to `DepartmentService`, drafts to `EvidenceService`, `ensure-profile` to `StudentProfileService`, instructor helpers and queues to `AdviserService` / `QueueListingService`, notifications to `NotificationService`, officer helpers and list queries to `ReportService` / `SubmissionReviewService`, queue line to `QueueListingService`, roster filters and loaders to `ReportService`, social links to `ContentService`, student helpers/launch/queue/record to `StudentProfileService` / `LaunchService` / `QueueJoinService` / `StudentRecordService`, student signup to `SignUpService`, submissions list to `SubmissionReviewService`, transfers to `TransferService`, users query to `UserAdminService` |
| `lib/platform/auth.ts`                  | `config/auth.ts`, `AuthService`, `middleware/auth.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `lib/platform/http.ts`                  | `middleware/http.ts` plus `config/errors.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `lib/platform/http-error.ts`            | `config/errors.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

`lib/report.ts` stays at the root only if the web still needs it at build time.
Under this spec the web copies the cap helpers, so `lib/report.ts` moves into
`ReportService` and its test moves with it.

### 5.10 Configuration

- `config/constants.ts`: `PRE_ENROLLMENT_STEP_CODES`, `STEP_CODES`,
  `STEP_NAMES`, `YEAR_LEVELS`, `YEAR_LEVEL_LABELS`, student-number pattern,
  and other pure values.
- `config/roles.ts`: `SurfaceId`, `landingSurfaceForRole`,
  `canUseStudentSurface`, `canEnterSurface`, role sets.
- `config/errors.ts`: `ApiError`, error codes, status mapping.
- `config/auth.ts`: Better Auth instance, session config, Google provider,
  plugin list.
- `config/auth/StudentSignUpPlugin.ts`: the plugin factory, unchanged in
  behavior.
- `config` must not import services, controllers, routes, or models.

## 6. Frozen external contract

### 6.1 Response envelopes

- Single resource: `{ "data": <payload> }`
- List: `{ "data": [...], "page": n, "pageSize": n, "total": n }` where the
  current endpoint uses pagination.
- Error: `{ "error": "<message>" }` with the current status code.
- SSE: `text/event-stream` with `retry: 3000`, `data: {...}` events, and
  `: ping` heartbeats.
- Chat: streamed response as today; no JSON envelope.
- Upload content: raw bytes and current headers, including range behavior.

No path, method, status code, header contract, or field name changes.

### 6.2 REST paths

Every path below must answer after the rewrite. This list is the parity
checklist seed.

```text
DELETE /api/v1/academic-years/:id
DELETE /api/v1/departments/:id
DELETE /api/v1/enrollments/:id/completion
DELETE /api/v1/enrollments/completions
DELETE /api/v1/evidence/:id
DELETE /api/v1/me/evidence-link
DELETE /api/v1/me/queue
DELETE /api/v1/me/steps/:code/submission
DELETE /api/v1/queues/serving
DELETE /api/v1/requirements/:id
DELETE /api/v1/social-links/:id
DELETE /api/v1/submissions/:id/verification
DELETE /api/v1/transfers/:id
DELETE /api/v1/users
DELETE /api/v1/users/:userId
GET    /api/v1/academic-years
GET    /api/v1/academic-years/:id/activation
GET    /api/v1/advisers
GET    /api/v1/chatbot-knowledge
GET    /api/v1/departments
GET    /api/v1/departments/:id/enrollments
GET    /api/v1/integrations
GET    /api/v1/me/departments
GET    /api/v1/me/enrollments
GET    /api/v1/me/launch
GET    /api/v1/me/notifications
GET    /api/v1/me/overview
GET    /api/v1/me/queue
GET    /api/v1/me/record
GET    /api/v1/me/stamp
GET    /api/v1/me/student
GET    /api/v1/me/student/profile
GET    /api/v1/profiling-form
GET    /api/v1/queues
GET    /api/v1/queue-shares/:token
GET    /api/v1/reports/roster
GET    /api/v1/reports/roster-stats
GET    /api/v1/reports/step-register
GET    /api/v1/reports/user-directory
GET    /api/v1/requirements
GET    /api/v1/signup-options
GET    /api/v1/social-links
GET    /api/v1/storage/session-status
GET    /api/v1/students
GET    /api/v1/students/:id
GET    /api/v1/students/:id/record
GET    /api/v1/submissions
GET    /api/v1/submissions/:verificationId
GET    /api/v1/transfers
GET    /api/v1/uploads/:id/content
GET    /api/v1/users
PATCH  /api/v1/academic-years/:id
PATCH  /api/v1/advisers/:adviserId
PATCH  /api/v1/departments/:id
PATCH  /api/v1/integrations/:key
PATCH  /api/v1/me/stamp
PATCH  /api/v1/me/student
PATCH  /api/v1/requirements/:id
PATCH  /api/v1/social-links/:id
PATCH  /api/v1/transfers/:id
PATCH  /api/v1/users
PATCH  /api/v1/users/:userId
POST   /api/v1/academic-years
POST   /api/v1/academic-years/:id/activation
POST   /api/v1/departments
POST   /api/v1/departments/:id/takeover
POST   /api/v1/enrollments/:id/completion
POST   /api/v1/evidence
POST   /api/v1/me/assessment
POST   /api/v1/me/availability/heartbeat
POST   /api/v1/me/enrollments
POST   /api/v1/me/notifications/read
POST   /api/v1/me/queue
POST   /api/v1/me/steps/:code/submission
POST   /api/v1/queue-entries/:id/removal
POST   /api/v1/queue-entries/:id/restoration
POST   /api/v1/queues/serving
POST   /api/v1/queues/serving/position
POST   /api/v1/queue-shares
POST   /api/v1/requirements
POST   /api/v1/social-links
POST   /api/v1/storage/complete
POST   /api/v1/storage/session
POST   /api/v1/students/reminders
POST   /api/v1/submissions/:id/replies
POST   /api/v1/submissions/:id/verification
POST   /api/v1/transfers
POST   /api/v1/users/:userId/password-reset
PUT    /api/v1/chatbot-knowledge
PUT    /api/v1/departments/:id/year-levels
PUT    /api/v1/me/availability
PUT    /api/v1/me/departments
PUT    /api/v1/me/evidence-link
PUT    /api/v1/profiling-form
PUT    /api/v1/requirements/order
PUT    /api/v1/social-links/order
PUT    /api/v1/students/:id/mugshot
```

Infrastructure endpoints:

```text
GET  /api/health
GET  /api/ready
GET  /api/metrics
GET  /api/events                  SSE, authenticated, heartbeat
POST /api/chat/stream             streamed, authenticated
ANY  /api/auth/*                  Better Auth handler
GET  /openapi.json
GET  /docs
GET  /docs/
```

### 6.3 Web route table

`apps/web/src/lib/api-routes.ts` stays the client source of truth. Its paths
must not be edited except to fix a mismatch confirmed by the parity checklist.
The server adapts to the table, not the other way around.

## 7. Web app changes

The web app stops consuming server code. This is required for the layers to be
independent and for the export map to be deleted.

1. Create `apps/web/src/lib/domain/` with:
   - `constants.ts` copied verbatim from `config/constants.ts`.
   - `roles.ts` copied verbatim from `config/roles.ts`.
   - `types.ts` (or one file per surface) with payload interfaces copied
     verbatim from the server: student record, launch, queue, report, user
     list, integration, live event, sign-up options, and other response types.
2. Replace every `@erpsys/server/*` import with the local copy. The touchpoints
   include domain constants, role rules, student sign-up types, report caps,
   integration types, SSE event types, roster and admin user types.
3. In `apps/web/src/lib/auth-client.ts`, replace the server-derived
   `StudentSignUpPlugin` type with a handwritten local plugin type that keeps
   the client's inference usable without importing server code. Keep it minimal:
   plugin id, the methods the client calls, and `$InferServerPlugin` as
   `unknown` or a local shape.
4. Remove `@erpsys/server` from `apps/web/package.json` and run `pnpm install`.
5. Keep behavior identical. This step changes imports and types only.

No server module may import from `apps/web`. No web module may import from
`apps/server`.

## 8. Migration plan

### Phase 0 — Baseline

1. Confirm the working tree is the intended baseline.
2. Commit it. Tag `pre-mvc-rewrite`.
3. Create branch `refactor/server-mvc`.

No code moves before the tag exists.

### Phase 1 — Skeleton and shared plumbing

1. Create `config/constants.ts`, `config/roles.ts`, `config/errors.ts`,
   `middleware/http.ts`, `middleware/catchAsync.ts`, `middleware/errorHandler.ts`,
   and `middleware/notFound.ts`. Create each resource's three folders only when
   that resource's phase starts; no empty folders.
2. Create the `models/` files for all 23 collections with the static reads and
   writes the current code needs. Models can be filled in as services need
   them; do not invent unused methods.
3. Move web constants and types per section 7, then delete the server export
   map subpaths only after the corresponding web import is gone.
4. Verify: `pnpm check`, `pnpm test`, `pnpm --filter web build`.

### Phase 2 — Auth

1. Create `config/auth.ts`, `config/auth/StudentSignUpPlugin.ts`,
   `services/auth/AuthService.ts`, `middleware/auth.ts`,
   `controllers/auth/AuthController.ts`, and `routes/auth/index.ts`.
2. Mount the Better Auth handler and the Google guard in the same order as
   today.
3. Delete `lib/platform/auth.ts` and the auth parts of `lib/platform/http.ts`.
4. Verify session cookies, Google sign-in, role guards, and sign-up through the
   UI.

### Phase 3 — Student self surface

1. `controllers/me/MeController.ts` (launch), `controllers/students/`
   (self methods), `controllers/evidence/`.
2. Services: `services/me/LaunchService.ts`, `services/students/`
   (`StudentProfileService`, `StudentStepService`, `StudentRecordService`),
   `services/evidence/EvidenceService.ts`, `services/auth/SignUpService.ts`.
3. Views: `LaunchView`, `StudentRecordView`.
4. Port draft evidence, evidence expiry, student-number claim, profile status,
   and student record queries.
5. Verify every student page and upload flow.

### Phase 4 — Storage

1. `controllers/storage/`, `services/storage/StorageSessionService.ts`,
   `services/storage/StorageContentService.ts`.
2. Keep R2 client, presigning, and quota counters in `lib/storage`.
3. Verify presigned upload, completion, session status, and mugshot/content
   reads, including range requests.

### Phase 5 — Queues

1. `controllers/queues/`, `controllers/queue-shares/`,
   `controllers/enrollments/`.
2. Services: `QueueJoinService`, `QueueServingService`, `QueueRevertService`,
   `QueueListingService`, `QueueShareService`, `QueueRemovalService`,
   `EnrollmentCompletionService`.
3. Views: `QueueView`.
4. Port queue-line queries, department scope checks, serving/revert state
   machine, notifications, and share tokens.
5. Verify student join, officer serving, revert, removal/restoration, queue
   close, and public share view.

### Phase 6 — Departments, advisers, transfers

1. `controllers/departments/`, `controllers/advisers/`,
   `controllers/transfers/`.
2. Services: `services/departments/DepartmentService.ts`,
   `services/departments/DepartmentTakeoverService.ts`,
   `services/advisers/AdviserAvailabilityService.ts`,
   `services/transfers/TransferService.ts`.
3. Port department identity, availability, year-level rules, and transfer state
   machine.
4. Verify department admin, instructor availability, and transfer flows.

### Phase 7 — Students admin, submissions, reports

1. `controllers/students/`, `controllers/submissions/`,
   `controllers/reports/`.
2. Services: `services/students/StudentDirectoryService.ts`,
   `services/submissions/SubmissionReviewService.ts`,
   `services/reports/ReportService.ts`.
3. Views: `ReportView`.
4. Port roster filters/loaders, officer helpers, submission list/detail,
   verify/revoke/reply, reminders, mugshot, and user-directory reports.
5. Verify officer and admin pages, report exports, and PDF data.

### Phase 8 — Admin surfaces

1. `controllers/users/`, `controllers/academic-years/`,
   `controllers/requirements/`, `controllers/integrations/`,
   `controllers/content/`, `controllers/me/` (overview and stamp).
2. Services: `services/users/UserAdminService.ts`,
   `services/academic-years/AcademicYearService.ts`,
   `services/requirements/RequirementService.ts`,
   `services/integrations/IntegrationSettingService.ts`,
   `services/content/ContentService.ts`,
   `services/me/OverviewService.ts`.
3. Port bulk role/delete, purge, password reset, year activation, requirement
   ordering, integration toggles, profiling form, social links, chatbot
   knowledge, overview, and stamp.
4. Verify admin console end to end.

### Phase 9 — System, chat, and final lib cleanup

1. `controllers/system/`, `controllers/chat/`, `routes/system/index.ts`,
   `routes/chat/index.ts`.
2. Services: `services/chat/ChatStreamService.ts`,
   `services/system/MetricsService.ts` if metrics needs a service.
3. Delete remaining `lib/domain`, `lib/queries`, and dead `lib/platform`
   modules.
4. Run the full parity checklist, all UI role flows, and the load script.
5. Delete old routes and old tests that were replaced.
6. Final `pnpm check`, `pnpm test`, `pnpm build`, `pnpm --filter web build`.

### Per-step definition of done

A step is complete only when all of these are true:

- `pnpm --filter @erpsys/server check` passes.
- `pnpm --filter web check` passes.
- `pnpm test` passes for the server and web projects.
- The affected UI flow was clicked through in a browser for every role it
  serves.
- The matching lines in the parity checklist are ticked.
- Replaced files are deleted; no dual implementation remains mounted.
- New or touched files are at or below 200 lines, or the split is recorded.
- The resource folder exists with the same name under `routes/`,
  `controllers/`, and `services/`.
- One commit describes the resource migrated.

## 9. Parity checklist

Copy this table into the implementation branch and tick as each resource
lands. The endpoint list in section 6.2 is the authoritative path set; group it
by owner below.

| Resource       | Paths                                                           | Tests | UI click-through | Ticked |
| -------------- | --------------------------------------------------------------- | ----- | ---------------- | ------ |
| Auth           | `/api/auth/*`, Google guard                                     |       |                  | [ ]    |
| System         | health, ready, metrics, events, docs, openapi                   |       |                  | [ ]    |
| Launch         | `GET /me/launch`                                                |       |                  | [ ]    |
| Student self   | `/me/student`, profile, record, assessment, notifications       |       |                  | [ ]    |
| Evidence       | `/evidence`, `/me/evidence-link`, step submission               |       |                  | [ ]    |
| Enrollment     | `/me/enrollments`, completions                                  |       |                  | [ ]    |
| Queue          | `/me/queue`, `/queues`, serving, entries, reminders             |       |                  | [ ]    |
| Queue shares   | `/queue-shares`, `/:token`                                      |       |                  | [ ]    |
| Storage        | session, complete, uploads content                              |       |                  | [ ]    |
| Departments    | CRUD, takeover, year-levels, enrollments                        |       |                  | [ ]    |
| Advisers       | `/advisers`, availability, heartbeat                            |       |                  | [ ]    |
| Transfers      | create, list, patch, delete                                     |       |                  | [ ]    |
| Students admin | list, detail, record, mugshot, reminders                        |       |                  | [ ]    |
| Submissions    | list, detail, verify, revoke, reply                             |       |                  | [ ]    |
| Users          | list, role, delete, password reset                              |       |                  | [ ]    |
| Academic years | CRUD, activation                                                |       |                  | [ ]    |
| Requirements   | CRUD, order                                                     |       |                  | [ ]    |
| Integrations   | list, patch                                                     |       |                  | [ ]    |
| Content        | profiling form, social links, chatbot knowledge, signup options |       |                  | [ ]    |
| Reports        | roster, roster-stats, step-register, user-directory             |       |                  | [ ]    |
| Overview       | `/me/overview`, `/me/stamp`                                     |       |                  | [ ]    |
| Chat           | `/api/chat/stream`                                              |       |                  | [ ]    |

A resource counts as done only when its row is fully ticked and its old
implementation is deleted.

### Bugs fixed during migration

Record each deliberate behavior change here with file, endpoint, and the
before/after behavior. There must be no unlisted behavior changes.

| Endpoint | Before | After | Reason |
| -------- | ------ | ----- | ------ |
|          |        |       |        |

## 10. Risks and edge cases

- **Route order.** `/students/reminders` must be registered before
  `/students/:id`. `/me/student/profile` before `/me/student`.
  `/queue-shares/:token` must not swallow `/queue-shares`. Better Auth's
  `/api/auth/*splat` must stay after the literal Google guard. Preserve the
  current registration order exactly.
- **Mount layout.** Self paths live inside their resource router and every
  router mounts at `/api/v1`, so `routes/index.ts` mount order now fixes the
  registration order of `/me/*` paths across resources. Keep that order stable
  and confirm no router claims a prefix it does not own (`queues` must not
  capture `/queue-shares` or `/queue-entries`).
- **Auth handler body parsing.** The Better Auth node handler is mounted as-is.
  Do not add JSON parsing in front of it and do not wrap it in `catchAsync`.
- **SSE.** `/api/events` writes headers and streams directly. It must not pass
  through `okOne`, response compression, or a wrapper that buffers. The
  heartbeat interval must be cleared on `close`.
- **Chat streaming.** `/api/chat/stream` also writes raw chunks. `catchAsync`
  must not convert an aborted stream into a JSON error after headers are sent.
- **Upload content.** `/uploads/:id/content` serves bytes and honors the current
  headers. Do not JSON-wrap it.
- **ID handling.** Legacy string ids and `ObjectId` forms coexist through
  `idForms` / `idIn`. Keep both forms at every boundary.
- **Duplicate keys.** The `11000` code paths for student number claims and
  notifications must keep their retry behavior. The notification fallback that
  retries one document at a time is behavior, not cleanup.
- **Error messages.** The web displays many `{ error }` messages. Preserve
  wording and status codes unless the message is listed as a fixed bug.
- **Static SPA serving.** `SERVE_WEB`, the build path, and the fallback order
  stay unchanged. API 404s must remain JSON.
- **Tests.** Moving tests to `tests/` changes the TypeScript project layout.
  Keep `tsconfig.json` emitting only `src`, and typecheck tests through a
  separate `tsconfig.test.json` or through Vitest's typecheck so `rootDir`
  does not break. Update every `vi.mock` path; route tests mock auth and DB by
  module path.
- **Removing the export map.** Do it after the last web import is replaced.
  `pnpm install` must be rerun when the workspace dependency is removed, and
  the lockfile committed.
- **200-line cap.** Several current files exceed it by design
  (`routes/v1/storage.ts`, `routes/v1/reports.ts`, `overview/summary.ts`,
  `domain/student-steps.ts`). Split along use-case boundaries, not arbitrary
  line breaks.
- **Behavior drift.** Fresh service code invites quiet rewrites. Port the
  existing query filters, sorts, projections, and error branches first; refactor
  only after the endpoint is green and ticked.
- **Background jobs.** Sweeps, queue repair/audit, index setup, and user purge
  start after listen, as today. Keep their `lib/db` modules and startup order.
- **Shutdown.** Process guards and shutdown handlers stay in `index.ts` with the
  same signals and timeouts.
- **Deployment.** No nginx or systemd edits are needed. If a path changes, the
  spec is wrong, not the deployment.

## 11. Acceptance criteria

The rewrite is done when:

1. `apps/server/src` contains the MVC layers and `src/lib` only for the six
   infrastructure areas in section 5.9.
2. `lib/domain` and `lib/queries` no longer exist.
3. No file under `apps/server/src` exceeds 200 lines without a recorded
   justification.
4. No controller imports Mongo or an integration client.
5. No route file contains business logic.
6. Every path in section 6.2 answers with the current shape and status.
7. Every row in the parity checklist is ticked and backed by a UI click-through.
8. `apps/web` has no `@erpsys/server` imports and no workspace dependency on the
   server.
9. `apps/server/package.json` has no export map subpaths.
10. Every resource has one folder with the same name in `routes/`,
    `controllers/`, and `services/`, and those layers contain no other
    top-level folders.
11. `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm --filter web build` pass.
12. The server boots, connects to Mongo, creates indexes, starts sweeps, serves
    SSE, and streams chat in a real run.
13. The only behavior changes are listed in the bug table.

## 12. Resolved questions

- Server domain rules live in services, with pure constants in `config`.
- All read/query modules become services; models stay data-shaped.
- One folder per URL resource, mirrored across `routes/`, `controllers/`, and
  `services/`; folder names match the first path segment.
- `/me/*` paths live in the resource folder they touch; only launch, overview,
  stamp, and notifications sit in `me/`.
- Obvious bugs found during migration are fixed and recorded.
- The web teacher/plugin type is handwritten locally.
- The web workspace dependency on the server is removed.
