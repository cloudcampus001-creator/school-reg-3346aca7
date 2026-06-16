import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, GraduationCap, Search, Smartphone, UserPlus, CheckCircle2, Clock, XCircle,
  Printer, Loader2, Bluetooth,
} from "lucide-react";
import {
  getSchoolBootstrap, registerStudent, getStudent, recoverByPhone, payFees, computeFees,
} from "@/lib/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { printToThermal, isWebBluetoothSupported } from "@/lib/thermal-printer";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Parent Portal — SchoolConnect" },
      { name: "description", content: "Register your child, pay tuition, or recover a matricule." },
    ],
  }),
  component: Portal,
});

const STORAGE_KEY = "edu_app_id";
type Mode = "home" | "register" | "status" | "tuition" | "recover";

function Portal() {
  const [mode, setMode] = useState<Mode>("home");
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id) { setStudentId(id); setMode("status"); }
  }, []);

  function gotoStatus(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setStudentId(id);
    setMode("status");
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    setStudentId(null);
    setMode("home");
  }

  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-display font-bold">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg hero-gradient">
            <GraduationCap className="h-5 w-5" />
          </span>
          SchoolConnect
        </Link>
        {mode !== "home" && (
          <button className="btn-ghost" onClick={() => mode === "status" ? null : setMode("home")}>
            {mode === "status" ? (
              <span className="text-sm text-muted-foreground">Demo Academy</span>
            ) : (
              <><ArrowLeft className="h-4 w-4" /> Back</>
            )}
          </button>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-5 pb-16">
        {mode === "home" && <HomeMode onChoose={setMode} hasSession={!!studentId} resume={() => setMode("status")} />}
        {mode === "register" && <RegisterMode onSuccess={gotoStatus} />}
        {mode === "status" && studentId && (
          <StatusMode studentId={studentId} onClear={clearSession} onPay={() => setMode("tuition")} />
        )}
        {mode === "tuition" && studentId && <PaymentMode studentId={studentId} onDone={() => setMode("status")} />}
        {mode === "recover" && <RecoverMode />}
      </main>
    </div>
  );
}

/* ---------------- HOME ---------------- */
function HomeMode({ onChoose, hasSession, resume }: { onChoose: (m: Mode) => void; hasSession: boolean; resume: () => void }) {
  return (
    <div className="card-surface p-8">
      <h1 className="text-3xl font-bold">Welcome, parent.</h1>
      <p className="mt-1 text-muted-foreground">What would you like to do today?</p>

      {hasSession && (
        <button onClick={resume} className="mt-6 w-full text-left card-surface p-4 hover:border-primary transition flex items-center justify-between">
          <div>
            <div className="font-semibold">Resume my application</div>
            <div className="text-sm text-muted-foreground">Continue where you left off</div>
          </div>
          <Clock className="h-5 w-5 text-primary" />
        </button>
      )}

      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        {[
          { key: "register" as const, icon: UserPlus, title: "Register a student", body: "Submit a new application" },
          { key: "tuition" as const, icon: Smartphone, title: "Pay tuition", body: "By matricule (MoMo)" },
          { key: "recover" as const, icon: Search, title: "Recover matricule", body: "Look up by phone number" },
        ].map((c) => (
          <button key={c.key} onClick={() => onChoose(c.key === "tuition" && !hasSession ? "recover" : c.key)}
            className="card-surface p-5 text-left hover:border-primary transition">
            <c.icon className="h-6 w-6 text-primary" />
            <div className="mt-3 font-semibold">{c.title}</div>
            <div className="text-sm text-muted-foreground">{c.body}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- REGISTER ---------------- */
function RegisterMode({ onSuccess }: { onSuccess: (id: string) => void }) {
  const bootstrap = useServerFn(getSchoolBootstrap);
  const register = useServerFn(registerStudent);
  const { data, isLoading } = useQuery({ queryKey: ["bootstrap"], queryFn: () => bootstrap() });

  const mutation = useMutation({
    mutationFn: (vars: any) => register({ data: vars }),
    onSuccess: (res) => { toast.success("Application submitted!"); onSuccess(res.id); },
    onError: (e: any) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      full_name: String(fd.get("full_name") || ""),
      gender: String(fd.get("gender") || "MALE"),
      date_of_birth: String(fd.get("date_of_birth") || ""),
      place_of_birth: String(fd.get("place_of_birth") || ""),
      parent_phone: String(fd.get("parent_phone") || ""),
      class_id: String(fd.get("class_id") || ""),
    });
  }

  if (isLoading) return <div className="card-surface p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;

  return (
    <div className="card-surface p-8">
      <h1 className="text-2xl font-bold">Student application</h1>
      <p className="mt-1 text-sm text-muted-foreground">Demo Academy · {data?.classes.length} classes available</p>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <Field label="Full name"><input name="full_name" required minLength={2} className="input-field" placeholder="e.g. Awa Mbeng" /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Gender">
            <select name="gender" required className="input-field">
              <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Date of birth"><input name="date_of_birth" type="date" required className="input-field" /></Field>
        </div>
        <Field label="Place of birth"><input name="place_of_birth" className="input-field" placeholder="e.g. Yaoundé" /></Field>
        <Field label="Parent phone"><input name="parent_phone" type="tel" required className="input-field" placeholder="+237 6XX XXX XXX" /></Field>
        <Field label="Class">
          <select name="class_id" required className="input-field">
            <option value="">Select a class</option>
            {data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <button disabled={mutation.isPending} className="btn-primary mt-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit application"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/* ---------------- STATUS ---------------- */
function StatusMode({ studentId, onClear, onPay }: { studentId: string; onClear: () => void; onPay: () => void }) {
  const get = useServerFn(getStudent);
  const compute = useServerFn(computeFees);
  const qc = useQueryClient();
  const { data: student, isLoading } = useQuery({
    queryKey: ["student", studentId],
    queryFn: () => get({ data: { id: studentId } }),
  });
  const { data: fees } = useQuery({
    queryKey: ["fees", studentId],
    queryFn: () => compute({ data: { student_id: studentId } }),
    enabled: !!student,
  });

  // realtime
  useEffect(() => {
    const ch = supabase.channel("student-" + studentId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "students", filter: `id=eq.${studentId}` },
        () => { qc.invalidateQueries({ queryKey: ["student", studentId] }); qc.invalidateQueries({ queryKey: ["fees", studentId] }); toast.message("Application updated"); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [studentId, qc]);

  // Pay registration
  const pay = useServerFn(payFees);
  const [showRegPay, setShowRegPay] = useState(false);

  if (isLoading) return <div className="card-surface p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;
  if (!student) return <div className="card-surface p-8">Application not found. <button className="text-primary underline" onClick={onClear}>Start over</button></div>;

  const status = student.application_status;
  const statusChip = status === "APPROVED" ? "chip-success" : status === "REJECTED" ? "chip-danger" : "chip-warning";
  const StatusIcon = status === "APPROVED" ? CheckCircle2 : status === "REJECTED" ? XCircle : Clock;

  return (
    <div className="space-y-4">
      <div className="card-surface p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Application</div>
            <h1 className="mt-1 text-2xl font-bold">{student.full_name}</h1>
            <div className="text-sm text-muted-foreground">{student.classes?.name} · {student.gender}</div>
          </div>
          <span className={statusChip}><StatusIcon className="h-3.5 w-3.5" />{status.replace("_", " ")}</span>
        </div>

        {status === "PENDING_REVIEW" && (
          <div className="mt-6 rounded-lg bg-primary-soft border border-primary/20 p-4 text-sm">
            <strong>Awaiting school review.</strong> You'll be notified the moment it's approved.
          </div>
        )}
        {status === "REJECTED" && (
          <div className="mt-6 rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm">
            Your application was not approved. Please contact the school.
          </div>
        )}

        {status === "APPROVED" && (
          <>
            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              <Stat label="Matricule" value={student.matricule ?? "—"} mono />
              <Stat label="Registered" value={student.is_registered ? "Yes" : "Pending payment"} />
              {fees && (
                <>
                  <Stat label="Registration fee" value={`${Number(fees.registration_fee).toLocaleString()} ${fees.currency}`} />
                  <Stat label="Tuition" value={`${Number(student.tuition_paid).toLocaleString()} / ${Number(fees.tuition_fee).toLocaleString()} ${fees.currency}`} />
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {!student.is_registered && fees && (
                <button onClick={() => setShowRegPay(true)} className="btn-primary">
                  Pay registration · {Number(fees.registration_fee).toLocaleString()} XAF
                </button>
              )}
              {student.is_registered && fees && fees.tuition_owed > 0 && (
                <button onClick={onPay} className="btn-primary">Pay tuition</button>
              )}
              {student.is_registered && fees && fees.tuition_owed === 0 && (
                <span className="chip-success"><CheckCircle2 className="h-3.5 w-3.5" /> Tuition fully paid</span>
              )}
            </div>
          </>
        )}

        <button onClick={onClear} className="btn-ghost mt-6 text-sm text-muted-foreground">Switch to another student</button>
      </div>

      {showRegPay && fees && (
        <PayDialog
          title="Pay registration fee"
          defaultAmount={fees.registration_fee}
          locked
          onClose={() => setShowRegPay(false)}
          onPay={async (vals) => {
            const res = await pay({ data: { student_id: studentId, type: "REGISTRATION", amount: fees.registration_fee, payment_method: vals.method, payment_phone: vals.phone } });
            return res;
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-semibold " + (mono ? "font-mono" : "")}>{value}</div>
    </div>
  );
}

/* ---------------- TUITION PAYMENT ---------------- */
function PaymentMode({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const compute = useServerFn(computeFees);
  const pay = useServerFn(payFees);
  const { data: fees } = useQuery({ queryKey: ["fees", studentId], queryFn: () => compute({ data: { student_id: studentId } }) });

  return (
    <div className="card-surface p-8">
      <h1 className="text-2xl font-bold">Pay tuition</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Owed: {fees ? `${Number(fees.tuition_owed).toLocaleString()} ${fees.currency}` : "…"}
      </p>
      {fees && (
        <PayDialog
          title="Tuition payment"
          defaultAmount={fees.tuition_owed}
          maxAmount={fees.tuition_owed}
          inline
          onClose={onDone}
          onPay={async (vals) => pay({ data: { student_id: studentId, type: "TUITION", amount: vals.amount, payment_method: vals.method, payment_phone: vals.phone } })}
        />
      )}
    </div>
  );
}

/* ---------------- PAY DIALOG ---------------- */
function PayDialog({
  title, defaultAmount, maxAmount, locked, inline, onClose, onPay,
}: {
  title: string; defaultAmount: number; maxAmount?: number; locked?: boolean; inline?: boolean;
  onClose: () => void;
  onPay: (vals: { amount: number; method: "MTN_MOMO" | "ORANGE_MONEY"; phone: string }) => Promise<any>;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<"MTN_MOMO" | "ORANGE_MONEY">("MTN_MOMO");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ content: string; reference: string } | null>(null);

  async function submit() {
    if (!phone) return toast.error("Enter the MoMo number");
    if (amount <= 0) return toast.error("Amount must be greater than 0");
    setSubmitting(true);
    try {
      const r = await onPay({ amount, method, phone });
      setReceipt({ content: r.print_job?.content ?? "", reference: r.reference });
      toast.success("Payment successful");
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  async function handlePrint() {
    try {
      if (!isWebBluetoothSupported()) {
        toast.error("Web Bluetooth not supported here. The receipt is queued for the bursar's printer.");
        return;
      }
      await printToThermal(receipt!.content);
      toast.success("Sent to printer");
    } catch (e: any) { toast.error(e.message ?? "Print failed"); }
  }

  const card = (
    <div className="card-surface p-6 mt-4">
      {!receipt ? (
        <>
          <h2 className="font-semibold text-lg">{title}</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Amount (XAF)">
              <input type="number" className="input-field" value={amount} disabled={locked}
                onChange={(e) => setAmount(Math.min(Number(e.target.value), maxAmount ?? Infinity))} />
            </Field>
            <Field label="Payment method">
              <div className="grid grid-cols-2 gap-2">
                {(["MTN_MOMO", "ORANGE_MONEY"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)}
                    className={"rounded-lg border-2 p-3 text-sm font-semibold transition " + (method === m ? "border-primary bg-primary-soft" : "border-border bg-surface")}>
                    {m === "MTN_MOMO" ? "MTN MoMo" : "Orange Money"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Mobile money number">
              <input className="input-field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+237 6XX XXX XXX" />
            </Field>
            <div className="flex gap-2 mt-2">
              <button disabled={submitting} onClick={submit} className="btn-primary flex-1">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ${amount.toLocaleString()} XAF`}
              </button>
              <button onClick={onClose} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </>
      ) : (
        <div>
          <div className="text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
            <h2 className="mt-2 text-xl font-bold">Payment received</h2>
            <p className="text-sm text-muted-foreground">Reference {receipt.reference}</p>
          </div>
          <pre className="mt-5 rounded-lg bg-muted p-4 font-mono text-xs whitespace-pre overflow-x-auto">{receipt.content}</pre>
          <div className="mt-4 flex gap-2">
            <button onClick={handlePrint} className="btn-primary flex-1">
              <Bluetooth className="h-4 w-4" /> Print receipt
            </button>
            <button onClick={onClose} className="btn-outline">Done</button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground text-center">
            <Printer className="inline h-3 w-3 mr-1" /> Receipt also queued for the bursar's printer.
          </p>
        </div>
      )}
    </div>
  );

  if (inline) return card;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>{card}</div>
    </div>
  );
}

/* ---------------- RECOVER ---------------- */
function RecoverMode() {
  const recover = useServerFn(recoverByPhone);
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await recover({ data: { phone } });
      setResults(r);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="card-surface p-8">
      <h1 className="text-2xl font-bold">Recover matricule</h1>
      <p className="mt-1 text-sm text-muted-foreground">We'll find every student tied to this phone number.</p>
      <form onSubmit={search} className="mt-6 flex gap-2">
        <input className="input-field" placeholder="+237 6XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        <button disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4" /> Search</>}
        </button>
      </form>
      {results && (
        <div className="mt-6 space-y-2">
          {results.length === 0 && <p className="text-sm text-muted-foreground">No students found for this phone.</p>}
          {results.map((s) => (
            <button key={s.id} onClick={() => { localStorage.setItem(STORAGE_KEY, s.id); navigate({ to: "/portal" }); window.location.reload(); }}
              className="w-full text-left card-surface p-4 hover:border-primary transition flex items-center justify-between">
              <div>
                <div className="font-semibold">{s.full_name}</div>
                <div className="text-xs text-muted-foreground">{s.classes?.name} · {s.application_status.replace("_", " ")}</div>
              </div>
              <div className="font-mono text-sm">{s.matricule ?? "—"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
