import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DEMO_SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_SCHOOL_SLUG = "DEMO";

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

async function currentYear() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("school_years").select("*").eq("school_id", DEMO_SCHOOL_ID)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

// ---- Role identity ----
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("user_roles").select("role, full_name")
      .eq("user_id", context.userId).limit(1).maybeSingle();
    const { count } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    return {
      role: (data?.role ?? null) as "admin" | "bursar" | null,
      full_name: data?.full_name ?? null,
      adminCount: count ?? 0,
    };
  });

export const claimAdminIfNone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("An admin already exists.");
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: context.userId, role: "admin", school_id: DEMO_SCHOOL_ID, full_name: "School Administrator",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- School info tab ----
export const getRevenueBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const year = await currentYear();
    if (!year) return { total: 0, breakdown: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enrollments } = await supabaseAdmin.from("student_enrollments").select("id").eq("school_year_id", year.id);
    const ids = (enrollments ?? []).map(e => e.id);
    if (!ids.length) return { total: 0, breakdown: [] };
    const { data: tx } = await supabaseAdmin.from("financial_transactions")
      .select("amount, payment_method").in("enrollment_id", ids);
    const rows = tx ?? [];
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const groups: Record<string, number> = { MOBILE_MONEY: 0, CASH: 0, BANK: 0 };
    for (const r of rows) {
      if (r.payment_method === "MTN_MOMO" || r.payment_method === "ORANGE_MONEY") groups.MOBILE_MONEY += Number(r.amount);
      else if (r.payment_method === "CASH") groups.CASH += Number(r.amount);
      else if (r.payment_method === "BANK") groups.BANK += Number(r.amount);
    }
    const breakdown = Object.entries(groups).map(([key, amt]) => ({
      key, amount: amt, pct: total ? Math.round((amt / total) * 1000) / 10 : 0,
    }));
    return { total, breakdown };
  });

// ---- Students info tab ----
export const getStudentKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const year = await currentYear();
    if (!year) return { total: 0, newAdmits: 0, oldStudents: 0, registered: 0, feeStarted: 0, feeCompleted: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("student_enrollments")
      .select("enrollment_kind, is_registered, tuition_paid, tuition_required")
      .eq("school_year_id", year.id).eq("dismissed", false);
    const rows = data ?? [];
    return {
      total: rows.length,
      newAdmits: rows.filter(r => r.enrollment_kind === "NEW_ADMIT").length,
      oldStudents: rows.filter(r => r.enrollment_kind === "OLD_STUDENT").length,
      registered: rows.filter(r => r.is_registered).length,
      feeStarted: rows.filter(r => r.is_registered && Number(r.tuition_paid) > 0 && Number(r.tuition_paid) < Number(r.tuition_required)).length,
      feeCompleted: rows.filter(r => r.is_registered && Number(r.tuition_paid) >= Number(r.tuition_required) && Number(r.tuition_required) > 0).length,
    };
  });

export const dismissStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollment_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("dismiss_student", { _enrollment_id: data.enrollment_id, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollment_id: z.string().uuid(), decision: z.enum(["PROMOTED", "REPEATED"]) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_promotion", { _enrollment_id: data.enrollment_id, _decision: data.decision });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Year lifecycle ----
export const getYearParameters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const year = await currentYear();
    if (!year) return { year: null, hasClosedPrevious: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [levelsRes, classesRes, fieldsRes, cfgRes, prevRes] = await Promise.all([
      supabaseAdmin.from("class_levels").select("*").eq("school_year_id", year.id).order("sort_order"),
      supabaseAdmin.from("classes").select("*").eq("school_year_id", year.id).order("sort_order"),
      supabaseAdmin.from("admission_field_defs").select("*").eq("school_year_id", year.id).order("sort_order"),
      supabaseAdmin.from("school_configs").select("*").eq("school_year_id", year.id).maybeSingle(),
      supabaseAdmin.from("school_years").select("id").eq("school_id", DEMO_SCHOOL_ID).eq("status", "CLOSED").limit(1),
    ]);
    return {
      year, levels: levelsRes.data ?? [], classes: classesRes.data ?? [],
      fields: fieldsRes.data ?? [], config: cfgRes.data,
      hasClosedPrevious: (prevRes.data ?? []).length > 0,
    };
  });

export const closeSchoolYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("close_school_year", { _school_id: DEMO_SCHOOL_ID });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Promotion queue — students from most recent closed year that need a decision or already have one
export const listPromotionQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: closed } = await supabaseAdmin.from("school_years").select("id, label")
      .eq("school_id", DEMO_SCHOOL_ID).eq("status", "CLOSED")
      .order("closed_at", { ascending: false }).limit(1).maybeSingle();
    if (!closed) return { year: null, rows: [] };
    const { data } = await supabaseAdmin.from("student_enrollments")
      .select(`id, promotion_decision, dismissed, students(full_name, matricule),
        classes(name, class_levels(name, sort_order))`)
      .eq("school_year_id", closed.id).eq("dismissed", false);
    return { year: closed, rows: data ?? [] };
  });

export const createSchoolYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    label: z.string().trim().min(4).max(20),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    levels: z.array(z.object({
      name: z.string().trim().min(1).max(60),
      sort_order: z.number().int(),
      subclasses: z.array(z.string().trim().min(1).max(60)).min(1),
    })).min(1),
    fee_config: z.object({
      fee_structure: z.enum(["UNIFORM", "SEGMENTED"]),
      currency: z.string().default("XAF"),
      uniform_registration_fee: z.number().nonnegative(),
      uniform_tuition_fee: z.number().nonnegative(),
      settlement_account: z.string().max(120).optional().nullable(),
      min_installment_amount: z.number().nonnegative().nullable().optional(),
      segmented: z.array(z.object({
        level_name: z.string(), registration: z.number().nonnegative(), tuition: z.number().nonnegative(),
      })).optional(),
    }),
    admission_fields: z.array(z.object({
      label: z.string().trim().min(1).max(80),
      data_type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"]),
      options: z.array(z.string()).optional().nullable(),
      is_required: z.boolean(),
      sort_order: z.number().int(),
    })).default([]),
    roll_forward: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = { ...data, school_id: DEMO_SCHOOL_ID };
    const { data: yid, error } = await supabaseAdmin.rpc("create_school_year", { _payload: payload as any });
    if (error) throw new Error(error.message);
    return { year_id: yid as unknown as string };
  });

// Bursar provisioning (kept from previous impl)
export const listBursars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("user_roles").select("user_id, full_name, created_at")
      .eq("role", "bursar").eq("school_id", DEMO_SCHOOL_ID).order("created_at", { ascending: false });
    const enriched: any[] = [];
    for (const r of data ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      enriched.push({ ...r, email: u.user?.email ?? null });
    }
    return enriched;
  });

export const createBursar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    full_name: z.string().trim().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(6).max(72),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.full_name, role: "bursar" },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: uid, role: "bursar", school_id: DEMO_SCHOOL_ID, full_name: data.full_name,
    });
    if (rErr) throw new Error(rErr.message);
    return { ok: true };
  });

// Roster + full profile for admin (view-only)
export const listRosterForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const year = await currentYear();
    if (!year) return { year: null, rows: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("student_enrollments")
      .select(`id, is_registered, tuition_required, tuition_paid, dismissed, enrollment_kind, promotion_decision,
        students(id, full_name, matricule, parent_phone, gender),
        classes(id, name, level_id, class_levels(name, sort_order))`)
      .eq("school_year_id", year.id).eq("dismissed", false)
      .order("created_at", { ascending: false });
    return { year, rows: data ?? [] };
  });
