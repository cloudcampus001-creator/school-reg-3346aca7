import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Loader2, Search, ArrowLeft, CheckCircle2, Wallet, XCircle } from "lucide-react";
import { getPortalBootstrap, searchStudents, getEnrollmentProfile, parentPay } from "@/lib/portal.functions";

export const Route = createFileRoute("/portal")({
  head: () => ({ meta: [
    { title: "Parent Portal · SchoolConnect" },
    { name: "description", content: "Find your child and pay school fees securely from your phone." },
  ]}),
  component: PortalPage,
});

type Step = "search" | "verify" | "pay" | "done";

function PortalPage() {
  const bootFn = useServerFn(getPortalBootstrap);
  const { data: boot, isLoading } = useQuery({ queryKey: ["portal-bootstrap"], queryFn: () => bootFn() });

  const [step, setStep] = useState<Step>("search");
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ reference: string; amount: number } | null>(null);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const yearClosed = !boot?.year || boot.year.status === "CLOSED";

  return (
    <div className="min-h-screen">
      <header data-nav-sticky className="nav-sticky">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg hero-gradient">
              <GraduationCap className="h-5 w-5" />
            </span>
            Parent Portal
          </Link>
          {boot?.year && <span className="chip text-xs">Year · {boot.year.label} · {boot.year.status}</span>}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        {yearClosed ? (
          <div className="card-surface p-10 text-center">
            <XCircle className="h-10 w-10 mx-auto text-warning" />
            <h1 className="mt-3 font-display text-2xl font-bold">School year is closed</h1>
            <p className="mt-2 text-muted-foreground">Payments are currently unavailable. Please check back once the school reopens for the new year.</p>
          </div>
        ) : step === "search" ? (
          <SearchStep onPick={(enrollmentId) => { setSelectedEnrollmentId(enrollmentId); setStep("verify"); }} />
        ) : step === "verify" && selectedEnrollmentId ? (
          <VerifyStep enrollmentId={selectedEnrollmentId} onBack={() => setStep("search")} onPay={() => setStep("pay")} />
        ) : step === "pay" && selectedEnrollmentId ? (
          <PayStep enrollmentId={selectedEnrollmentId} onBack={() => setStep("verify")}
            onDone={(r) => { setReceipt(r); setStep("done"); }} />
        ) : step === "done" && receipt ? (
          <DoneStep receipt={receipt} onNew={() => { setSelectedEnrollmentId(null); setReceipt(null); setStep("search"); }} />
        ) : null}
      </main>
    </div>
  );
}

function SearchStep({ onPick }: { onPick: (enrollmentId: string) => void }) {
  const fn = useServerFn(searchStudents);
  const [q, setQ] = useState("");
  const [ran, setRan] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!q.trim()) return;
    setBusy(true); setRan(true);
    try {
      const r = await fn({ data: { q: q.trim() } });
      setRows(r);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Find your child</h1>
      <p className="text-muted-foreground text-sm mt-1">Type the student's full name. Spelling and word order are forgiven.</p>

      <div className="card-surface mt-5 p-5">
        <div className="flex gap-2">
          <input className="input-field flex-1" placeholder="E.G. MBENG AWA" value={q}
            onChange={(e) => setQ(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && go()} autoFocus />
          <button onClick={go} disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4" /> Search</>}
          </button>
        </div>

        {ran && !busy && rows.length === 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            No student found. Check the spelling and try again — or contact the school if you believe your child should be here.
          </div>
        )}

        <div className="mt-4 grid gap-2">
          {rows.map((r) => (
            <button key={r.enrollment_id} onClick={() => onPick(r.enrollment_id)}
              className="text-left border border-border rounded-lg p-4 hover:bg-muted transition">
              <div className="font-semibold">{r.full_name}</div>
              <div className="text-sm text-muted-foreground">
                {r.class_name ?? "—"}{r.level_name ? ` · ${r.level_name}` : ""}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function statusOf(e: any): "NOT_REGISTERED" | "REGISTERED" | "FEE_NOT_COMPLETED" | "FEE_COMPLETED" {
  if (!e.is_registered) return "NOT_REGISTERED";
  const paid = Number(e.tuition_paid); const req = Number(e.tuition_required);
  if (paid <= 0) return "REGISTERED";
  if (paid >= req && req > 0) return "FEE_COMPLETED";
  return "FEE_NOT_COMPLETED";
}
const statusChip: Record<string, string> = {
  NOT_REGISTERED: "chip-warning",
  REGISTERED: "chip",
  FEE_NOT_COMPLETED: "chip-warning",
  FEE_COMPLETED: "chip-success",
};
const statusLabel: Record<string, string> = {
  NOT_REGISTERED: "Not registered",
  REGISTERED: "Registered · fee owed",
  FEE_NOT_COMPLETED: "Fee partially paid",
  FEE_COMPLETED: "Fully paid",
};

function VerifyStep({ enrollmentId, onBack, onPay }: { enrollmentId: string; onBack: () => void; onPay: () => void }) {
  const fn = useServerFn(getEnrollmentProfile);
  const { data, isLoading } = useQuery({
    queryKey: ["portal-enrollment", enrollmentId], queryFn: () => fn({ data: { enrollment_id: enrollmentId } }),
  });
  if (isLoading || !data) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const enr: any = data.enrollment;
  const s = enr.students;
  const cls = enr.classes;
  const status = statusOf(enr);
  const owed = Math.max(0, Number(enr.tuition_required) - Number(enr.tuition_paid));

  return (
    <div>
      <button onClick={onBack} className="btn-ghost text-sm mb-3"><ArrowLeft className="h-4 w-4" /> Back to search</button>
      <div className="card-surface p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold">{s.full_name}</h1>
            <div className="text-sm text-muted-foreground mt-0.5">{cls?.name}{cls?.class_levels?.name ? ` · ${cls.class_levels.name}` : ""}</div>
          </div>
          <span className={statusChip[status]}>{statusLabel[status]}</span>
        </div>

        <dl className="mt-5 grid sm:grid-cols-2 gap-3 text-sm">
          <Info k="Matricule" v={s.matricule} mono />
          <Info k="Gender" v={s.gender} />
          <Info k="Date of birth" v={s.date_of_birth} />
          <Info k="Place of birth" v={s.place_of_birth || "—"} />
          <Info k="Parent phone" v={s.parent_phone} />
          <Info k="Enrollment" v={enr.enrollment_kind === "NEW_ADMIT" ? "New admission" : "Returning student"} />
        </dl>

        {data.fields && data.fields.length > 0 && (
          <div className="mt-5">
            <div className="text-xs uppercase text-muted-foreground mb-2">Admission details</div>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              {data.fields.map((f: any) => (
                <Info key={f.id} k={f.label} v={String((enr.extra_fields ?? {})[f.id] ?? "—")} />
              ))}
            </dl>
          </div>
        )}

        <hr className="my-5 border-border" />

        {status === "NOT_REGISTERED" && (
          <div>
            <div className="text-sm">This student is <strong>not yet registered</strong> for the year. Only the registration fee is due right now.</div>
            <button onClick={onPay} className="btn-primary mt-3"><Wallet className="h-4 w-4" /> Pay registration fee</button>
          </div>
        )}
        {status === "REGISTERED" && (
          <div>
            <div className="text-sm">Registered. Tuition due: <strong>{owed.toLocaleString()} {data.config?.currency ?? "XAF"}</strong>.</div>
            <button onClick={onPay} className="btn-primary mt-3"><Wallet className="h-4 w-4" /> Pay tuition</button>
          </div>
        )}
        {status === "FEE_NOT_COMPLETED" && (
          <div>
            <div className="text-sm">Tuition remaining: <strong>{owed.toLocaleString()} {data.config?.currency ?? "XAF"}</strong> of {Number(enr.tuition_required).toLocaleString()}.</div>
            <button onClick={onPay} className="btn-primary mt-3"><Wallet className="h-4 w-4" /> Continue paying tuition</button>
          </div>
        )}
        {status === "FEE_COMPLETED" && (
          <div className="chip-success"><CheckCircle2 className="h-4 w-4" /> All fees paid for the year. No action needed.</div>
        )}
      </div>
    </div>
  );
}

function Info({ k, v, mono }: { k: string; v: any; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className={"mt-0.5 " + (mono ? "font-mono text-sm" : "text-sm")}>{v ?? "—"}</div>
    </div>
  );
}

function PayStep({ enrollmentId, onBack, onDone }: { enrollmentId: string; onBack: () => void; onDone: (r: { reference: string; amount: number }) => void }) {
  const profileFn = useServerFn(getEnrollmentProfile);
  const payFn = useServerFn(parentPay);
  const { data, isLoading } = useQuery({
    queryKey: ["portal-enrollment", enrollmentId], queryFn: () => profileFn({ data: { enrollment_id: enrollmentId } }),
  });
  const [method, setMethod] = useState<"MTN_MOMO" | "ORANGE_MONEY">("MTN_MOMO");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const enr: any = data?.enrollment;
  const cfg: any = data?.config;
  const status = enr ? statusOf(enr) : "NOT_REGISTERED";
  const owedTuition = enr ? Math.max(0, Number(enr.tuition_required) - Number(enr.tuition_paid)) : 0;
  const registrationFee = useMemo(() => {
    if (!cfg) return 0;
    if (cfg.fee_structure === "SEGMENTED") {
      return Number(enr?.classes?.segmented_registration_fee ?? cfg.uniform_registration_fee ?? 0);
    }
    return Number(cfg.uniform_registration_fee ?? 0);
  }, [cfg, enr]);

  const isRegistration = status === "NOT_REGISTERED";
  const minInstall = cfg?.min_installment_amount ? Number(cfg.min_installment_amount) : null;

  useEffect(() => {
    if (isRegistration) setAmount(registrationFee);
    else setAmount(owedTuition);
  }, [isRegistration, registrationFee, owedTuition]);

  async function submit() {
    if (!/^[+0-9\s\-()]{6,20}$/.test(phone)) return toast.error("Enter a valid phone");
    if (amount <= 0) return toast.error("Amount must be positive");
    if (isRegistration && amount !== registrationFee) return toast.error("Registration must be paid in full");
    if (!isRegistration && amount > owedTuition) return toast.error("Amount exceeds remaining tuition");
    if (!isRegistration && minInstall && amount < minInstall && amount < owedTuition) return toast.error(`Minimum installment is ${minInstall.toLocaleString()}`);
    setBusy(true);
    try {
      const res = await payFn({ data: {
        enrollment_id: enrollmentId,
        type: isRegistration ? "REGISTRATION" : "TUITION",
        amount, payment_method: method, payment_phone: phone,
      }});
      onDone({ reference: (res as any).reference, amount });
      toast.success("Payment recorded");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (isLoading || !data) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div>
      <button onClick={onBack} className="btn-ghost text-sm mb-3"><ArrowLeft className="h-4 w-4" /> Back</button>
      <div className="card-surface p-6">
        <h2 className="font-display text-xl font-bold">{isRegistration ? "Pay registration fee" : "Pay tuition"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isRegistration
            ? `Fee: ${registrationFee.toLocaleString()} ${cfg?.currency ?? "XAF"} — must be paid in full.`
            : `Remaining: ${owedTuition.toLocaleString()} ${cfg?.currency ?? "XAF"}${minInstall ? ` · Minimum installment: ${minInstall.toLocaleString()}` : " · Any partial amount allowed"}.`}
        </p>

        <div className="mt-5 grid gap-3">
          <label>
            <span className="text-sm font-medium">Amount ({cfg?.currency ?? "XAF"})</span>
            <input type="number" className="input-field mt-1" value={amount}
              disabled={isRegistration} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label>
            <span className="text-sm font-medium">Mobile money provider</span>
            <select className="input-field mt-1" value={method} onChange={(e) => setMethod(e.target.value as any)}>
              <option value="MTN_MOMO">MTN Mobile Money</option>
              <option value="ORANGE_MONEY">Orange Money</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-medium">Phone number to charge</span>
            <input className="input-field mt-1" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+237 6XX XXX XXX" />
          </label>
          <button onClick={submit} disabled={busy} className="btn-primary mt-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wallet className="h-4 w-4" /> Pay {amount.toLocaleString()} {cfg?.currency ?? "XAF"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function DoneStep({ receipt, onNew }: { receipt: { reference: string; amount: number }; onNew: () => void }) {
  return (
    <div className="card-surface p-10 text-center">
      <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
      <h1 className="mt-3 font-display text-2xl font-bold">Payment successful</h1>
      <p className="mt-2 text-muted-foreground">Reference: <span className="font-mono">{receipt.reference}</span></p>
      <p className="text-muted-foreground">Amount: {receipt.amount.toLocaleString()} XAF</p>
      <button onClick={onNew} className="btn-primary mt-6">Return to search</button>
    </div>
  );
}
