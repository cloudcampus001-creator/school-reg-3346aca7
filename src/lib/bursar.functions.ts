import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DEMO_SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_SCHOOL_SLUG = "DEMO";

async function ensureStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "bursar"]).maybeSingle();
  if (!data) throw new Error("Forbidden: staff role required");
  return data.role as "admin" | "bursar";
}

async function currentYear() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("school_years").select("*").eq("school_id", DEMO_SCHOOL_ID)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

// Admission form schema
export const getAdmissionSchema = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const year = await currentYear();
    if (!year) return { year: null, levels: [], classes: [], fields: [] };
    const [levelsRes, classesRes, fieldsRes, cfgRes] = await Promise.all([
      supabaseAdmin.from("class_levels").select("id, name, sort_order").eq("school_year_id", year.id).order("sort_order"),
      supabaseAdmin.from("classes").select("id, name, level_id, sort_order").eq("school_year_id", year.id).order("sort_order"),
      supabaseAdmin.from("admission_field_defs").select("*").eq("school_year_id", year.id).order("sort_order"),
      supabaseAdmin.from("school_configs").select("*").eq("school_year_id", year.id).maybeSingle(),
    ]);
    return { year, levels: levelsRes.data ?? [], classes: classesRes.data ?? [], fields: fieldsRes.data ?? [], config: cfgRes.data };
  });

// Admit a new student (creates student + enrollment + matricule)
export const admitStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    full_name: z.string().trim().min(2).max(120),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    place_of_birth: z.string().trim().max(120).optional().nullable(),
    parent_phone: z.string().trim().min(6).max(30),
    class_id: z.string().uuid(),
    extra_fields: z.record(z.any()).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.userId);
    const year = await currentYear();
    if (!year || year.status !== "OPEN") throw new Error("No open school year");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enrollmentId, error } = await supabaseAdmin.rpc("admit_student", {
      _school_id: DEMO_SCHOOL_ID, _school_slug: DEMO_SCHOOL_SLUG,
      _full_name: data.full_name, _gender: data.gender, _dob: data.date_of_birth,
      _place: data.place_of_birth ?? "", _phone: data.parent_phone,
      _class_id: data.class_id, _extra: data.extra_fields ?? {},
    });
    if (error) throw new Error(error.message);
    return { enrollment_id: enrollmentId as unknown as string };
  });

// Roster
export const listRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context.userId);
    const year = await currentYear();
    if (!year) return { year: null, rows: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("student_enrollments")
      .select(`id, is_registered, tuition_required, tuition_paid, dismissed, enrollment_kind, class_id,
        students(id, full_name, matricule, parent_phone, gender),
        classes(id, name, level_id, class_levels(name, sort_order))`)
      .eq("school_year_id", year.id).eq("dismissed", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { year, rows: data ?? [] };
  });

// Smart search — same as portal but staff-restricted
export const staffSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.userId);
    const year = await currentYear();
    if (!year) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("search_students", {
      _school_id: DEMO_SCHOOL_ID, _year_id: year.id, _q: data.q,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Bursar cash/bank payment
export const bursarPay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    enrollment_id: z.string().uuid(),
    type: z.enum(["REGISTRATION", "TUITION"]),
    amount: z.number().positive(),
    payment_method: z.enum(["CASH", "BANK"]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.userId);
    const year = await currentYear();
    if (!year || year.status !== "OPEN") throw new Error("School year is closed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("record_payment", {
      _enrollment_id: data.enrollment_id, _type: data.type, _amount: data.amount,
      _method: data.payment_method, _phone: "",
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(res) ? res[0] : res;
    return { transaction_id: (row as any).transaction_id, reference: (row as any).reference };
  });

// Enrollment profile (server-side for staff — includes richer info)
export const getEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollment_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enr, error } = await supabaseAdmin.from("student_enrollments")
      .select(`*, students(*), classes(id, name, level_id, class_levels(name))`)
      .eq("id", data.enrollment_id).maybeSingle();
    if (error) throw new Error(error.message);
    return enr;
  });

// Get transaction for reprint
export const getReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ transaction_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tx, error } = await supabaseAdmin.from("financial_transactions")
      .select("id, amount, type, payment_method, reference, created_at, payment_phone, students(full_name, matricule)")
      .eq("id", data.transaction_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!tx) throw new Error("Transaction not found");
    return tx;
  });
