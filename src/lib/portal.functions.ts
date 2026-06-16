import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const DEMO_SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_SCHOOL_SLUG = "DEMO";

function getClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const phoneRe = /^[+0-9\s\-()]{6,20}$/;

// ============ Get school config + classes (public) ============
export const getSchoolBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getClient();
  const [schoolRes, configRes, classesRes] = await Promise.all([
    sb.from("schools").select("id, name, slug").eq("id", DEMO_SCHOOL_ID).maybeSingle(),
    sb.from("school_configs").select("*").eq("school_id", DEMO_SCHOOL_ID).maybeSingle(),
    sb.from("classes").select("id, name, segmented_registration_fee, segmented_tuition_fee, sort_order")
      .eq("school_id", DEMO_SCHOOL_ID).order("sort_order"),
  ]);
  if (schoolRes.error) throw new Error(schoolRes.error.message);
  if (configRes.error) throw new Error(configRes.error.message);
  if (classesRes.error) throw new Error(classesRes.error.message);
  return {
    school: schoolRes.data!,
    config: configRes.data!,
    classes: classesRes.data ?? [],
  };
});

// ============ Register Student ============
const registerSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  place_of_birth: z.string().trim().max(120).optional(),
  parent_phone: z.string().trim().regex(phoneRe),
  class_id: z.string().uuid(),
});

export const registerStudent = createServerFn({ method: "POST" })
  .inputValidator((d) => registerSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = getClient();
    const { data: row, error } = await sb
      .from("students")
      .insert({
        school_id: DEMO_SCHOOL_ID,
        class_id: data.class_id,
        full_name: data.full_name,
        gender: data.gender,
        date_of_birth: data.date_of_birth,
        place_of_birth: data.place_of_birth ?? null,
        parent_phone: data.parent_phone,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ============ Get student status (public lookup by id) ============
export const getStudent = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = getClient();
    const { data: row, error } = await sb
      .from("students")
      .select("id, full_name, gender, date_of_birth, place_of_birth, parent_phone, matricule, application_status, is_registered, tuition_paid, class_id, classes(name, segmented_tuition_fee, segmented_registration_fee)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ Recover by phone ============
export const recoverByPhone = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: z.string().trim().regex(phoneRe) }).parse(d))
  .handler(async ({ data }) => {
    const sb = getClient();
    const { data: rows, error } = await sb
      .from("students")
      .select("id, full_name, matricule, application_status, classes(name)")
      .eq("parent_phone", data.phone)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============ Pay (registration or tuition) ============
const paySchema = z.object({
  student_id: z.string().uuid(),
  type: z.enum(["REGISTRATION", "TUITION"]),
  amount: z.number().positive().max(10_000_000),
  payment_method: z.enum(["MTN_MOMO", "ORANGE_MONEY"]),
  payment_phone: z.string().trim().regex(phoneRe),
});

export const payFees = createServerFn({ method: "POST" })
  .inputValidator((d) => paySchema.parse(d))
  .handler(async ({ data }) => {
    // service-role import for trusted write of payment + student update + print job
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student, error: sErr } = await supabaseAdmin
      .from("students").select("*, classes(name)").eq("id", data.student_id).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!student) throw new Error("Student not found");
    if (student.application_status !== "APPROVED")
      throw new Error("Application must be approved before payment");

    const reference = "TX-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    const { data: tx, error: tErr } = await supabaseAdmin
      .from("financial_transactions")
      .insert({
        school_id: DEMO_SCHOOL_ID,
        student_id: data.student_id,
        amount: data.amount,
        type: data.type,
        payment_method: data.payment_method,
        payment_phone: data.payment_phone,
        status: "SUCCESS",
        reference,
      }).select("id").single();
    if (tErr) throw new Error(tErr.message);

    // Update student
    if (data.type === "REGISTRATION") {
      // assign matricule + flip is_registered
      const { data: matRes, error: mErr } = await supabaseAdmin
        .rpc("generate_matricule", { _school_slug: DEMO_SCHOOL_SLUG });
      if (mErr) throw new Error(mErr.message);
      await supabaseAdmin.from("students").update({
        is_registered: true,
        matricule: matRes as unknown as string,
      }).eq("id", data.student_id);
    } else {
      const newPaid = Number(student.tuition_paid) + data.amount;
      await supabaseAdmin.from("students").update({ tuition_paid: newPaid }).eq("id", data.student_id);
    }

    // Build receipt content
    const now = new Date();
    const content = [
      "================================",
      "     DEMO ACADEMY",
      "     OFFICIAL RECEIPT",
      "================================",
      `Date: ${now.toLocaleString()}`,
      `Ref : ${reference}`,
      "--------------------------------",
      `Student: ${student.full_name}`,
      `Class  : ${student.classes?.name ?? "-"}`,
      `Type   : ${data.type}`,
      `Method : ${data.payment_method.replace("_", " ")}`,
      `Phone  : ${data.payment_phone}`,
      "--------------------------------",
      `AMOUNT : ${data.amount.toLocaleString()} XAF`,
      "================================",
      "Thank you!",
      "",
    ].join("\n");

    const { data: job } = await supabaseAdmin.from("print_jobs").insert({
      school_id: DEMO_SCHOOL_ID,
      transaction_id: tx.id,
      content,
      status: "PENDING",
    }).select("id, content").single();

    return { transaction_id: tx.id, reference, print_job: job };
  });

// ============ Pay for registration (gate: amount derived) ============
export const computeFees = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ student_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = getClient();
    const [studentRes, configRes] = await Promise.all([
      sb.from("students").select("id, class_id, tuition_paid, is_registered, classes(segmented_registration_fee, segmented_tuition_fee)").eq("id", data.student_id).maybeSingle(),
      sb.from("school_configs").select("*").eq("school_id", DEMO_SCHOOL_ID).maybeSingle(),
    ]);
    if (studentRes.error) throw new Error(studentRes.error.message);
    if (configRes.error) throw new Error(configRes.error.message);
    const s = studentRes.data!;
    const cfg = configRes.data!;
    const registration = cfg.fee_structure === "UNIFORM"
      ? Number(cfg.uniform_registration_fee)
      : Number(s.classes?.segmented_registration_fee ?? 0);
    const tuition = cfg.fee_structure === "UNIFORM"
      ? Number(cfg.uniform_tuition_fee)
      : Number(s.classes?.segmented_tuition_fee ?? 0);
    return {
      currency: cfg.currency,
      registration_fee: registration,
      tuition_fee: tuition,
      tuition_paid: Number(s.tuition_paid),
      tuition_owed: Math.max(0, tuition - Number(s.tuition_paid)),
      is_registered: s.is_registered,
    };
  });
