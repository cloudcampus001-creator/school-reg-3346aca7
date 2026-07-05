
-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================================
-- 2. WIPE OLD DATA (demo-only; pre-launch)
-- =====================================================================
TRUNCATE TABLE public.financial_transactions CASCADE;
TRUNCATE TABLE public.print_jobs CASCADE;
DELETE FROM public.students;
DELETE FROM public.classes;
DELETE FROM public.school_configs;

-- =====================================================================
-- 3. DROP OLD COLUMNS / ENUM
-- =====================================================================
ALTER TABLE public.students DROP COLUMN IF EXISTS application_status;
ALTER TABLE public.students DROP COLUMN IF EXISTS is_registered;
ALTER TABLE public.students DROP COLUMN IF EXISTS tuition_paid;
ALTER TABLE public.students DROP COLUMN IF EXISTS class_id;

DROP TYPE IF EXISTS public.application_status;

-- =====================================================================
-- 4. NEW ENUMS
-- =====================================================================
DO $$ BEGIN CREATE TYPE public.school_year_status AS ENUM ('OPEN','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.enrollment_kind AS ENUM ('NEW_ADMIT','OLD_STUDENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.promotion_decision AS ENUM ('PROMOTED','REPEATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.admission_field_type AS ENUM ('TEXT','NUMBER','DATE','BOOLEAN','SELECT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 5. school_years
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.school_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label text NOT NULL,
  status public.school_year_status NOT NULL DEFAULT 'OPEN',
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_years_one_open_per_school
  ON public.school_years(school_id) WHERE status = 'OPEN';
CREATE UNIQUE INDEX IF NOT EXISTS school_years_label_per_school
  ON public.school_years(school_id, label);

GRANT SELECT ON public.school_years TO anon, authenticated;
GRANT ALL ON public.school_years TO service_role;
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read years" ON public.school_years FOR SELECT TO anon, authenticated USING (true);

-- =====================================================================
-- 6. class_levels
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.class_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_levels_year_idx ON public.class_levels(school_year_id, sort_order);

GRANT SELECT ON public.class_levels TO anon, authenticated;
GRANT ALL ON public.class_levels TO service_role;
ALTER TABLE public.class_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read levels" ON public.class_levels FOR SELECT TO anon, authenticated USING (true);

-- =====================================================================
-- 7. classes — add level_id + school_year_id
-- =====================================================================
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS level_id uuid REFERENCES public.class_levels(id) ON DELETE CASCADE;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS classes_year_idx ON public.classes(school_year_id, sort_order);
CREATE INDEX IF NOT EXISTS classes_level_idx ON public.classes(level_id, sort_order);

-- =====================================================================
-- 8. school_configs — become per-year
-- =====================================================================
ALTER TABLE public.school_configs ADD COLUMN IF NOT EXISTS school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE;
ALTER TABLE public.school_configs ADD COLUMN IF NOT EXISTS min_installment_amount numeric;
CREATE UNIQUE INDEX IF NOT EXISTS school_configs_one_per_year ON public.school_configs(school_year_id);

-- =====================================================================
-- 9. students — slim identity, matricule unique
-- =====================================================================
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS students_matricule_unique ON public.students(matricule) WHERE matricule IS NOT NULL;
CREATE INDEX IF NOT EXISTS students_name_trgm ON public.students USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS students_school_idx ON public.students(school_id);

-- =====================================================================
-- 10. student_enrollments
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  enrollment_kind public.enrollment_kind NOT NULL DEFAULT 'NEW_ADMIT',
  is_registered boolean NOT NULL DEFAULT false,
  tuition_required numeric NOT NULL DEFAULT 0,
  tuition_paid numeric NOT NULL DEFAULT 0,
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_reason text,
  promotion_decision public.promotion_decision,
  extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, school_year_id)
);
CREATE INDEX IF NOT EXISTS enrollments_year_idx ON public.student_enrollments(school_year_id);
CREATE INDEX IF NOT EXISTS enrollments_class_idx ON public.student_enrollments(class_id);

GRANT SELECT ON public.student_enrollments TO anon, authenticated;
GRANT ALL ON public.student_enrollments TO service_role;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read enrollments" ON public.student_enrollments FOR SELECT TO anon, authenticated USING (true);

-- =====================================================================
-- 11. admission_field_defs
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admission_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  label text NOT NULL,
  data_type public.admission_field_type NOT NULL DEFAULT 'TEXT',
  options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS afd_year_idx ON public.admission_field_defs(school_year_id, sort_order);
GRANT SELECT ON public.admission_field_defs TO anon, authenticated;
GRANT ALL ON public.admission_field_defs TO service_role;
ALTER TABLE public.admission_field_defs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read admission fields" ON public.admission_field_defs FOR SELECT TO anon, authenticated USING (true);

-- =====================================================================
-- 12. financial_transactions — link to enrollment
-- =====================================================================
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES public.student_enrollments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ft_enrollment_idx ON public.financial_transactions(enrollment_id);

-- =====================================================================
-- 13. UPDATED matricule generator — uses year sequence
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_matricule(_school_slug text, _year_label text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq int;
BEGIN
  -- take last 2 digits of the last 4 chars of label if it looks like "2026/2027"
  yr := substr(regexp_replace(_year_label, '[^0-9]', '', 'g'), 3, 2);
  IF yr IS NULL OR length(yr) = 0 THEN yr := to_char(now(), 'YY'); END IF;
  SELECT COUNT(*) + 1 INTO seq FROM public.students
    WHERE matricule IS NOT NULL AND matricule LIKE upper(_school_slug) || '-' || yr || '-%';
  RETURN upper(_school_slug) || '-' || yr || '-' || lpad(seq::text, 4, '0');
END; $$;

-- =====================================================================
-- 14. TRIGRAM SEARCH FUNCTION
-- =====================================================================
CREATE OR REPLACE FUNCTION public.search_students(_school_id uuid, _year_id uuid, _q text)
RETURNS TABLE (
  student_id uuid, enrollment_id uuid, full_name text, matricule text,
  class_id uuid, class_name text, level_name text,
  is_registered boolean, tuition_required numeric, tuition_paid numeric,
  score real
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, e.id, s.full_name, s.matricule,
         c.id, c.name, l.name,
         e.is_registered, e.tuition_required, e.tuition_paid,
         similarity(s.full_name, upper(coalesce(_q,''))) AS score
  FROM public.students s
  JOIN public.student_enrollments e ON e.student_id = s.id
  LEFT JOIN public.classes c ON c.id = e.class_id
  LEFT JOIN public.class_levels l ON l.id = c.level_id
  WHERE s.school_id = _school_id
    AND e.school_year_id = _year_id
    AND e.dismissed = false
    AND (
      _q IS NULL OR length(trim(_q)) = 0
      OR s.full_name ILIKE '%' || _q || '%'
      OR similarity(s.full_name, upper(_q)) > 0.15
    )
  ORDER BY score DESC NULLS LAST, s.full_name ASC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.search_students(uuid, uuid, text) TO anon, authenticated;

-- =====================================================================
-- 15. Helpers to compute tuition_required for a class
-- =====================================================================
CREATE OR REPLACE FUNCTION public.compute_tuition_required(_year_id uuid, _class_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record; cls record;
BEGIN
  SELECT * INTO cfg FROM public.school_configs WHERE school_year_id = _year_id LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;
  IF cfg.fee_structure = 'SEGMENTED' THEN
    SELECT * INTO cls FROM public.classes WHERE id = _class_id;
    RETURN COALESCE(cls.segmented_tuition_fee, cfg.uniform_tuition_fee, 0);
  ELSE
    RETURN COALESCE(cfg.uniform_tuition_fee, 0);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.compute_registration_required(_year_id uuid, _class_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record; cls record;
BEGIN
  SELECT * INTO cfg FROM public.school_configs WHERE school_year_id = _year_id LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;
  IF cfg.fee_structure = 'SEGMENTED' THEN
    SELECT * INTO cls FROM public.classes WHERE id = _class_id;
    RETURN COALESCE(cls.segmented_registration_fee, cfg.uniform_registration_fee, 0);
  ELSE
    RETURN COALESCE(cfg.uniform_registration_fee, 0);
  END IF;
END; $$;

-- =====================================================================
-- 16. admit_student — bursar/admin only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admit_student(
  _school_id uuid, _school_slug text,
  _full_name text, _gender text, _dob date, _place text, _phone text,
  _class_id uuid, _extra jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year record; v_student_id uuid; v_enrollment_id uuid; v_mat text; v_tuition numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(auth.uid(),'bursar') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO v_year FROM public.school_years WHERE school_id = _school_id AND status = 'OPEN' LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No open school year'; END IF;

  v_mat := public.generate_matricule(_school_slug, v_year.label);
  INSERT INTO public.students(school_id, full_name, gender, date_of_birth, place_of_birth, parent_phone, matricule)
    VALUES (_school_id, upper(trim(_full_name)), _gender, _dob, _place, _phone, v_mat)
    RETURNING id INTO v_student_id;

  v_tuition := public.compute_tuition_required(v_year.id, _class_id);

  INSERT INTO public.student_enrollments(student_id, school_year_id, class_id, enrollment_kind, tuition_required, extra_fields)
    VALUES (v_student_id, v_year.id, _class_id, 'NEW_ADMIT', v_tuition, COALESCE(_extra, '{}'::jsonb))
    RETURNING id INTO v_enrollment_id;

  RETURN v_enrollment_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admit_student(uuid,text,text,text,date,text,text,uuid,jsonb) TO authenticated;

-- =====================================================================
-- 17. record_payment — anon can call for MoMo, staff for cash/bank
-- =====================================================================
CREATE OR REPLACE FUNCTION public.record_payment(
  _enrollment_id uuid, _type text, _amount numeric,
  _method text, _phone text
) RETURNS TABLE(transaction_id uuid, reference text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enr record; v_year record; v_reg numeric; v_ref text; v_tx_id uuid; v_is_staff boolean; v_min numeric;
BEGIN
  v_is_staff := auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'bursar') OR public.has_role(auth.uid(),'admin'));
  IF _method IN ('CASH','BANK') AND NOT v_is_staff THEN RAISE EXCEPTION 'Only staff can record cash/bank'; END IF;
  IF _method NOT IN ('CASH','BANK','MTN_MOMO','ORANGE_MONEY') THEN RAISE EXCEPTION 'Bad method'; END IF;
  IF _type NOT IN ('REGISTRATION','TUITION') THEN RAISE EXCEPTION 'Bad type'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO v_enr FROM public.student_enrollments WHERE id = _enrollment_id;
  IF v_enr IS NULL THEN RAISE EXCEPTION 'Enrollment not found'; END IF;
  IF v_enr.dismissed THEN RAISE EXCEPTION 'Dismissed student'; END IF;

  SELECT * INTO v_year FROM public.school_years WHERE id = v_enr.school_year_id;
  IF v_year.status <> 'OPEN' THEN RAISE EXCEPTION 'School year is closed'; END IF;

  IF _type = 'REGISTRATION' THEN
    IF v_enr.is_registered THEN RAISE EXCEPTION 'Already registered'; END IF;
    v_reg := public.compute_registration_required(v_enr.school_year_id, v_enr.class_id);
    IF _amount < v_reg THEN RAISE EXCEPTION 'Registration must be paid in full: %', v_reg; END IF;
    UPDATE public.student_enrollments SET is_registered = true, updated_at = now() WHERE id = _enrollment_id;
  ELSE
    IF NOT v_enr.is_registered THEN RAISE EXCEPTION 'Must be registered first'; END IF;
    IF v_enr.tuition_paid >= v_enr.tuition_required THEN RAISE EXCEPTION 'Tuition already complete'; END IF;
    IF v_enr.tuition_paid + _amount > v_enr.tuition_required THEN
      RAISE EXCEPTION 'Amount exceeds remaining tuition';
    END IF;
    SELECT min_installment_amount INTO v_min FROM public.school_configs WHERE school_year_id = v_enr.school_year_id;
    IF v_min IS NOT NULL AND _amount < v_min AND (v_enr.tuition_paid + _amount) < v_enr.tuition_required THEN
      RAISE EXCEPTION 'Minimum installment is %', v_min;
    END IF;
    UPDATE public.student_enrollments SET tuition_paid = tuition_paid + _amount, updated_at = now() WHERE id = _enrollment_id;
  END IF;

  v_ref := 'TX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  INSERT INTO public.financial_transactions(school_id, student_id, enrollment_id, amount, type, payment_method, payment_phone, status, reference)
    VALUES ((SELECT school_id FROM public.students WHERE id = v_enr.student_id), v_enr.student_id, _enrollment_id, _amount, _type::transaction_type, _method, _phone, 'SUCCESS', v_ref)
    RETURNING id INTO v_tx_id;
  RETURN QUERY SELECT v_tx_id, v_ref;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid,text,numeric,text,text) TO anon, authenticated;

-- =====================================================================
-- 18. dismiss_student — admin only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dismiss_student(_enrollment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.student_enrollments SET dismissed = true, dismissed_reason = _reason, updated_at = now()
   WHERE id = _enrollment_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.dismiss_student(uuid,text) TO authenticated;

-- =====================================================================
-- 19. set_promotion — admin only, year must be closed
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_promotion(_enrollment_id uuid, _decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enr record; v_year record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _decision NOT IN ('PROMOTED','REPEATED') THEN RAISE EXCEPTION 'Bad decision'; END IF;
  SELECT * INTO v_enr FROM public.student_enrollments WHERE id = _enrollment_id;
  IF v_enr IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT * INTO v_year FROM public.school_years WHERE id = v_enr.school_year_id;
  IF v_year.status <> 'CLOSED' THEN RAISE EXCEPTION 'Year must be closed'; END IF;
  UPDATE public.student_enrollments SET promotion_decision = _decision::promotion_decision, updated_at = now()
   WHERE id = _enrollment_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_promotion(uuid,text) TO authenticated;

-- =====================================================================
-- 20. close_school_year — admin only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.close_school_year(_school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.school_years SET status = 'CLOSED', closed_at = now()
    WHERE school_id = _school_id AND status = 'OPEN';
END; $$;
GRANT EXECUTE ON FUNCTION public.close_school_year(uuid) TO authenticated;

-- =====================================================================
-- 21. create_school_year — admin only, big payload
-- Payload shape:
-- {
--   "school_id": "...",
--   "label": "2027/2028",
--   "starts_on": "2027-09-01",
--   "levels": [{"name":"Form 1","sort_order":1,"subclasses":["Form 1 A","Form 1 B"]}, ...],
--   "fee_config": {
--     "fee_structure":"UNIFORM"|"SEGMENTED",
--     "currency":"XAF",
--     "uniform_registration_fee":25000,
--     "uniform_tuition_fee":150000,
--     "settlement_account":"...",
--     "min_installment_amount":null,
--     "segmented":[{"level_name":"Form 1","registration":30000,"tuition":180000}, ...]
--   },
--   "admission_fields": [{"label":"Blood type","data_type":"TEXT","is_required":false,"options":null,"sort_order":1}, ...],
--   "roll_forward": true|false  -- carry students from previous CLOSED year based on promotion_decision
-- }
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_school_year(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id uuid := (_payload->>'school_id')::uuid;
  v_label text := _payload->>'label';
  v_starts date := COALESCE((_payload->>'starts_on')::date, CURRENT_DATE);
  v_fee jsonb := _payload->'fee_config';
  v_year_id uuid;
  v_level jsonb; v_level_id uuid; v_level_sort int;
  v_sub text;
  v_class_id uuid;
  v_field jsonb;
  v_seg jsonb;
  v_reg numeric; v_tui numeric;
  v_prev_year uuid;
  v_prev record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF EXISTS (SELECT 1 FROM public.school_years WHERE school_id = v_school_id AND status = 'OPEN') THEN
    RAISE EXCEPTION 'An OPEN year already exists';
  END IF;

  INSERT INTO public.school_years(school_id, label, status, starts_on)
    VALUES (v_school_id, v_label, 'OPEN', v_starts)
    RETURNING id INTO v_year_id;

  -- fee config first (compute helpers need it)
  INSERT INTO public.school_configs(school_id, school_year_id, fee_structure, currency,
    uniform_registration_fee, uniform_tuition_fee, settlement_account, min_installment_amount)
  VALUES (v_school_id, v_year_id,
    COALESCE(v_fee->>'fee_structure','UNIFORM')::fee_structure,
    COALESCE(v_fee->>'currency','XAF'),
    COALESCE((v_fee->>'uniform_registration_fee')::numeric, 25000),
    COALESCE((v_fee->>'uniform_tuition_fee')::numeric, 150000),
    v_fee->>'settlement_account',
    NULLIF(v_fee->>'min_installment_amount','')::numeric);

  -- levels + sub-classes
  FOR v_level IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'levels','[]'::jsonb)) LOOP
    v_level_sort := COALESCE((v_level->>'sort_order')::int, 0);
    INSERT INTO public.class_levels(school_id, school_year_id, name, sort_order)
      VALUES (v_school_id, v_year_id, v_level->>'name', v_level_sort)
      RETURNING id INTO v_level_id;
    -- segmented fees per level (applied to all sub-classes of the level)
    v_reg := NULL; v_tui := NULL;
    IF v_fee->'segmented' IS NOT NULL THEN
      SELECT (s->>'registration')::numeric, (s->>'tuition')::numeric INTO v_reg, v_tui
      FROM jsonb_array_elements(v_fee->'segmented') s
      WHERE s->>'level_name' = v_level->>'name' LIMIT 1;
    END IF;
    FOR v_sub IN SELECT jsonb_array_elements_text(COALESCE(v_level->'subclasses','[]'::jsonb)) LOOP
      INSERT INTO public.classes(school_id, school_year_id, level_id, name, sort_order,
        segmented_registration_fee, segmented_tuition_fee)
      VALUES (v_school_id, v_year_id, v_level_id, v_sub, v_level_sort, v_reg, v_tui);
    END LOOP;
  END LOOP;

  -- admission fields
  FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'admission_fields','[]'::jsonb)) LOOP
    INSERT INTO public.admission_field_defs(school_year_id, label, data_type, options, is_required, sort_order)
      VALUES (v_year_id, v_field->>'label',
        COALESCE(v_field->>'data_type','TEXT')::admission_field_type,
        v_field->'options',
        COALESCE((v_field->>'is_required')::boolean, false),
        COALESCE((v_field->>'sort_order')::int, 0));
  END LOOP;

  -- roll forward from most recent CLOSED year
  IF COALESCE((_payload->>'roll_forward')::boolean, false) THEN
    SELECT id INTO v_prev_year FROM public.school_years
     WHERE school_id = v_school_id AND status = 'CLOSED'
     ORDER BY closed_at DESC NULLS LAST LIMIT 1;
    IF v_prev_year IS NOT NULL THEN
      FOR v_prev IN
        SELECT e.*, c.level_id AS prev_level_id, l.sort_order AS prev_level_sort
        FROM public.student_enrollments e
        LEFT JOIN public.classes c ON c.id = e.class_id
        LEFT JOIN public.class_levels l ON l.id = c.level_id
        WHERE e.school_year_id = v_prev_year
          AND e.dismissed = false
          AND e.promotion_decision IS NOT NULL
      LOOP
        -- pick target class: promoted → first sub-class of next level up; repeated → first sub-class of previous level's name
        v_class_id := NULL;
        IF v_prev.promotion_decision = 'PROMOTED' THEN
          SELECT c.id INTO v_class_id
          FROM public.classes c
          JOIN public.class_levels l ON l.id = c.level_id
          WHERE c.school_year_id = v_year_id AND l.sort_order > v_prev.prev_level_sort
          ORDER BY l.sort_order ASC, c.sort_order ASC LIMIT 1;
        ELSE
          SELECT c.id INTO v_class_id
          FROM public.classes c
          JOIN public.class_levels l ON l.id = c.level_id
          WHERE c.school_year_id = v_year_id AND l.sort_order = v_prev.prev_level_sort
          ORDER BY c.sort_order ASC LIMIT 1;
        END IF;
        IF v_class_id IS NULL THEN
          -- fallback: first class of the new year
          SELECT id INTO v_class_id FROM public.classes WHERE school_year_id = v_year_id
            ORDER BY sort_order ASC LIMIT 1;
        END IF;
        v_tui := public.compute_tuition_required(v_year_id, v_class_id);
        INSERT INTO public.student_enrollments(student_id, school_year_id, class_id, enrollment_kind, tuition_required, extra_fields)
          VALUES (v_prev.student_id, v_year_id, v_class_id, 'OLD_STUDENT', v_tui, '{}'::jsonb)
          ON CONFLICT (student_id, school_year_id) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN v_year_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_school_year(jsonb) TO authenticated;

-- =====================================================================
-- 22. Seed demo school year "2026/2027"
-- =====================================================================
DO $$
DECLARE
  v_school_id uuid := '11111111-1111-1111-1111-111111111111';
  v_year_id uuid; v_lvl1 uuid; v_lvl2 uuid; v_lvl3 uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = v_school_id) THEN
    INSERT INTO public.schools(id, name, slug) VALUES (v_school_id, 'Demo Academy', 'DEMO');
  END IF;

  INSERT INTO public.school_years(school_id, label, status, starts_on)
    VALUES (v_school_id, '2026/2027', 'OPEN', CURRENT_DATE)
    RETURNING id INTO v_year_id;

  INSERT INTO public.school_configs(school_id, school_year_id, fee_structure, currency, uniform_registration_fee, uniform_tuition_fee, settlement_account, min_installment_amount)
    VALUES (v_school_id, v_year_id, 'UNIFORM', 'XAF', 25000, 150000, 'MTN MoMo · 6XX XXX XXX', NULL);

  INSERT INTO public.class_levels(school_id, school_year_id, name, sort_order) VALUES (v_school_id, v_year_id, 'Form 1', 1) RETURNING id INTO v_lvl1;
  INSERT INTO public.class_levels(school_id, school_year_id, name, sort_order) VALUES (v_school_id, v_year_id, 'Form 2', 2) RETURNING id INTO v_lvl2;
  INSERT INTO public.class_levels(school_id, school_year_id, name, sort_order) VALUES (v_school_id, v_year_id, 'Form 3', 3) RETURNING id INTO v_lvl3;

  INSERT INTO public.classes(school_id, school_year_id, level_id, name, sort_order) VALUES
    (v_school_id, v_year_id, v_lvl1, 'Form 1 A', 1),
    (v_school_id, v_year_id, v_lvl1, 'Form 1 B', 2),
    (v_school_id, v_year_id, v_lvl2, 'Form 2 A', 3),
    (v_school_id, v_year_id, v_lvl2, 'Form 2 B', 4),
    (v_school_id, v_year_id, v_lvl3, 'Form 3 A', 5),
    (v_school_id, v_year_id, v_lvl3, 'Form 3 B', 6);

  INSERT INTO public.admission_field_defs(school_year_id, label, data_type, is_required, sort_order) VALUES
    (v_year_id, 'Blood type', 'TEXT', false, 1),
    (v_year_id, 'Previous school', 'TEXT', false, 2);
END $$;
