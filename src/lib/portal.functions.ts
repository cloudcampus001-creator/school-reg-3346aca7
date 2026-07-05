import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const DEMO_SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_SCHOOL_SLUG = "DEMO";

function pub() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}
const phoneRe = /^[+0-9\s\-()]{6,20}$/;

// -------- Current year / school bootstrap --------
export const getPortalBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const sb = pub();
  const [schoolRes, yearRes] = await Promise.all([
    sb.from("schools").select("id, name, slug").eq("id", DEMO_SCHOOL_ID).maybeSingle(),
    sb.from("school_years").select("*").eq("school_id", DEMO_SCHOOL_ID).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (schoolRes.error) throw new Error(schoolRes.error.message);
  if (yearRes.error) throw new Error(yearRes.error.message);
  let config: any = null;
  if (yearRes.data) {
    const { data } = await sb.from("school_configs").select("*").eq("school_year_id", yearRes.data.id).maybeSingle();
    config = data;
  }
  return { school: schoolRes.data!, year: yearRes.data, config };
});

// -------- Trigram search --------
export const searchStudents = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().max(120) }).parse(d))
  .handler(async ({ data }) => {
    const sb = pub();
    const { data: year } = await sb.from("school_years")
      .select("id, status").eq("school_id", DEMO_SCHOOL_ID).eq("status", "OPEN").maybeSingle();
    if (!year) return [];
    const { data: rows, error } = await sb.rpc("search_students", {
      _school_id: DEMO_SCHOOL_ID, _year_id: year.id, _q: data.q,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// -------- Full profile --------
export const getEnrollmentProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ enrollment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = pub();
    const { data: enr, error } = await sb.from("student_enrollments")
      .select(`id, is_registered, tuition_required, tuition_paid, enrollment_kind, extra_fields, school_year_id, class_id,
        students(id, full_name, gender, date_of_birth, place_of_birth, parent_phone, matricule),
        classes(id, name, level_id, class_levels(name))`)
      .eq("id", data.enrollment_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!enr) return null;
    const [cfgRes, fieldsRes] = await Promise.all([
      sb.from("school_configs").select("*").eq("school_year_id", enr.school_year_id).maybeSingle(),
      sb.from("admission_field_defs").select("*").eq("school_year_id", enr.school_year_id).order("sort_order"),
    ]);
    return { enrollment: enr, config: cfgRes.data, fields: fieldsRes.data ?? [] };
  });

// -------- Parent MoMo payment --------
export const parentPay = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    enrollment_id: z.string().uuid(),
    type: z.enum(["REGISTRATION", "TUITION"]),
    amount: z.number().positive().max(10_000_000),
    payment_method: z.enum(["MTN_MOMO", "ORANGE_MONEY"]),
    payment_phone: z.string().trim().regex(phoneRe),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = pub();
    const { data: res, error } = await sb.rpc("record_payment", {
      _enrollment_id: data.enrollment_id,
      _type: data.type,
      _amount: data.amount,
      _method: data.payment_method,
      _phone: data.payment_phone,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(res) ? res[0] : res;
    return { transaction_id: (row as any).transaction_id, reference: (row as any).reference };
  });
