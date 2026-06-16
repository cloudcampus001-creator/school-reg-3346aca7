import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DEMO_SCHOOL_ID = "11111111-1111-1111-1111-111111111111";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// Check if current user is admin (used by UI)
export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    // also count admins to allow first-admin self-bootstrap
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    return { isAdmin: !!data, adminCount: count ?? 0 };
  });

// First-admin self-grant: if no admin exists yet, the caller may claim admin.
export const claimAdminIfNone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("An admin already exists. Ask an existing admin to grant you access.");
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: context.userId, role: "admin", school_id: DEMO_SCHOOL_ID,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// List applications
export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED", "ALL"]).default("ALL") }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("students")
      .select("id, full_name, gender, date_of_birth, parent_phone, matricule, application_status, is_registered, tuition_paid, created_at, classes(name)")
      .eq("school_id", DEMO_SCHOOL_ID)
      .order("created_at", { ascending: false });
    if (data.status !== "ALL") q = q.eq("application_status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Approve / Reject
export const setApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    student_id: z.string().uuid(),
    status: z.enum(["APPROVED", "REJECTED", "PENDING_REVIEW"]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("students")
      .update({ application_status: data.status })
      .eq("id", data.student_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Finance dashboard summary
export const getFinanceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [txRes, studentsRes] = await Promise.all([
      supabaseAdmin.from("financial_transactions").select("amount, type, created_at, payment_method, reference, students(full_name, matricule)").eq("school_id", DEMO_SCHOOL_ID).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("students").select("application_status, is_registered, tuition_paid", { count: "exact" }).eq("school_id", DEMO_SCHOOL_ID),
    ]);
    if (txRes.error) throw new Error(txRes.error.message);
    if (studentsRes.error) throw new Error(studentsRes.error.message);
    const tx = txRes.data ?? [];
    const students = studentsRes.data ?? [];
    const totalCollected = tx.reduce((s, t) => s + Number(t.amount), 0);
    const totalRegistration = tx.filter(t => t.type === "REGISTRATION").reduce((s, t) => s + Number(t.amount), 0);
    const totalTuition = tx.filter(t => t.type === "TUITION").reduce((s, t) => s + Number(t.amount), 0);
    return {
      totalCollected, totalRegistration, totalTuition,
      transactions: tx,
      counts: {
        total: students.length,
        pending: students.filter(s => s.application_status === "PENDING_REVIEW").length,
        approved: students.filter(s => s.application_status === "APPROVED").length,
        registered: students.filter(s => s.is_registered).length,
      },
    };
  });

// Print queue
export const listPrintJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("print_jobs")
      .select("id, status, content, created_at, transaction_id")
      .eq("school_id", DEMO_SCHOOL_ID)
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markPrintJobPrinted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("print_jobs").update({ status: "PRINTED" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
