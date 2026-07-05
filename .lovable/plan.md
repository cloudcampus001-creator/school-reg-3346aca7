
# Rebuild plan — School Year lifecycle + bursar-only admission

Scoped to one implementation pass. Old flows are deleted, not left running alongside.

## 1. Database migration (single file)

Enable `pg_trgm`. Drop `application_status` enum + column. Drop `students.class_id`, `is_registered`, `tuition_paid`. Drop old `school_configs` row shape.

New tables (all with GRANTs + RLS):
- `school_years` (school_id, label, status OPEN|CLOSED, starts_on, closed_at) — partial unique index on (school_id) where status='OPEN'.
- `class_levels` (school_id, name, sort_order).
- `classes` gains `level_id`, `school_year_id`. (Existing classes get migrated into the current year's structure — since demo data is disposable, we drop & reseed on first year creation.)
- `admission_field_defs` (school_year_id, label, data_type TEXT|NUMBER|DATE|BOOLEAN|SELECT, options jsonb, is_required, sort_order).
- `student_enrollments` (student_id, school_year_id, class_id, enrollment_kind NEW_ADMIT|OLD_STUDENT, is_registered, tuition_required, tuition_paid, dismissed, dismissed_reason, promotion_decision PROMOTED|REPEATED|null, extra_fields jsonb) — jsonb chosen over separate values table for simplicity.
- `school_configs` becomes per school_year_id (fee_structure, uniform fees, currency, settlement_account, min_installment nullable — null = any partial allowed).
- `financial_transactions` gains `enrollment_id` (nullable for legacy). Old transactions are wiped since the model incompatibly changes.

`students` slimmed to identity only. Matricule generated at admission time (bursar action), not on payment.

GIN trigram index on `students.full_name` for smart search. Helper SQL function `search_students(_school_id, _year_id, _q)` returns students with an enrollment in that year, ranked by `similarity(full_name, q)`, threshold ~0.15.

RLS: anon can SELECT students/enrollments/classes/levels/configs/years/field_defs for portal search & payment. INSERT on students/enrollments restricted to authenticated bursar/admin via `has_role`. financial_transactions: anon INSERT stays (portal MoMo), authenticated INSERT for cash/bank. UPDATE on enrollments (increment tuition_paid, dismiss, promotion decision) via SECURITY DEFINER functions.

SECURITY DEFINER SQL functions:
- `admit_student(...)` → creates student (if new) + matricule + enrollment. Bursar/admin only.
- `record_payment(enrollment_id, type, amount, method, phone)` → atomically increments tuition_paid or flips is_registered, inserts transaction. Callable by anon for MoMo (validated), by authenticated for cash/bank.
- `dismiss_student(enrollment_id, reason)` — admin only.
- `set_promotion(enrollment_id, decision)` — admin only, requires year CLOSED.
- `close_school_year(year_id)` — admin only.
- `create_school_year(payload jsonb)` — admin only; creates year + levels + classes + config + field defs + rolls forward enrollments from previous CLOSED year.

## 2. Server functions (rewrite)

Delete: `registerStudent`, `recoverByPhone`, `decideApplication`, `listPendingApprovals`, `listAwaitingPayment`, `getBursarCounters`, old `parentPay` uses students table directly.

`src/lib/portal.functions.ts` — public:
- `getCurrentYear(schoolSlug)` → year row + status.
- `searchStudents({ school_slug, q })` → trigram search in open year; returns [{student, enrollment, class, level}].
- `getStudentProfile({ enrollment_id })` → full profile incl. extra_fields, admission field defs.
- `parentPay({ enrollment_id, type, amount, phone, method })` — MoMo only (MTN/Orange).

`src/lib/bursar.functions.ts` — authenticated bursar/admin:
- `getAdmissionFormSchema()` — current year field defs + class tree.
- `admitStudent({ core fields, class_id, extra_fields })`.
- `listRoster({ view: 'flat'|'segmented' })`.
- `searchRoster({ q })` — same trigram helper.
- `bursarPay({ enrollment_id, type, amount, method: CASH|BANK })`.
- `getReceipt`, keep.

`src/lib/admin.functions.ts` — admin only:
- `getRevenueBreakdown()` — total + by method + %.
- `getStudentKpis()` — 4 KPI counts.
- `dismissStudent({ enrollment_id, reason })`.
- `setPromotion({ enrollment_id, decision })`.
- `closeSchoolYear()`.
- `createSchoolYear({ label, starts_on, levels[], classes_by_level, fee_config, admission_fields[] })` — includes optional promotion-driven roll-forward.
- `listRosterForYear`, `listPromotionQueue`, `getPreviousYearForRollForward`.

## 3. Frontend

### `/portal`
Rewrite from scratch. 3-step machine (Search → Verify → Pay). Auto-uppercase input. If year CLOSED → single "School year is closed" panel. No register form, no recover-by-phone, no localStorage session.

### `/bursar`
Two tabs: **Admission** (dynamic form from `admission_field_defs` + fixed core), **Payment completion** (smart search + roster with flat/segmented toggle, click-through profile with cash/bank payment). Read-only when year CLOSED.

### `/admin`
Three tabs: **School info** (QR PDF stays + full revenue breakdown with %), **Students info** (4 KPIs + smart search + flat/segmented roster + CSV & PDF export + profile with Dismiss OR Promote/Repeat when CLOSED), **School year parameters** (view current config + Close Year button, OR create-new-year wizard when no OPEN year).

New wizard component: 6 steps (label → levels → sub-classes → fees → admission fields → optional roll-forward review). Multi-step form with local state, single final submit to `createSchoolYear`.

### Confirmation modals
Reusable `<DangerConfirmDialog>` component (red bg, explicit Confirm button, sentence-long warning). Used for Dismiss + Close Year.

### PDF export
Use existing `jspdf` + `jspdf-autotable` (add if missing) for roster PDF.

## 4. Cleanup

Delete old code paths in one sweep: `RegisterForm`, recover UI, home "Register a student" tile, `MatriculeSearch`, `PendingApprovalsSection`, `AwaitingPaymentSection`, unused server fns. Update `src/routes/index.tsx` home tiles accordingly.

## 5. Order of operations

1. Migration (schema + functions + RLS + trigram + seed one OPEN year "2026/2027" for Demo Academy with minimal levels/classes/config so the app isn't broken on first load).
2. Types regenerate (auto).
3. Rewrite server functions.
4. Rewrite routes + components.
5. Verify build.

## Out of scope / deliberate choices

- Using jsonb `extra_fields` on enrollments instead of a separate values table (simpler queries, matches "either is fine" note).
- Existing historical transactions/students are wiped in the migration (pre-launch demo data, no production users). This is called out explicitly so nothing is preserved by accident.
- No migration of old `is_registered`/`tuition_paid` values — clean slate.
- Segmented fees stored on `classes` (existing columns), uniform on `school_configs`.
- Trigram threshold hard-coded at 0.15; can be tuned later.

Reply "go" to execute. This will be one large batch of file writes + one migration approval.
