import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  GraduationCap, LogOut, Loader2, ShieldAlert, Users, Info as InfoIcon, Settings2, Download,
  QrCode, Lock, Trash2, ArrowUp, RotateCcw, Plus, X, Search,
} from "lucide-react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyRole, claimAdminIfNone, getRevenueBreakdown, getStudentKpis, listRosterForAdmin,
  dismissStudent, setPromotion, getYearParameters, closeSchoolYear, createSchoolYear,
  listPromotionQueue, listBursars, createBursar,
} from "@/lib/admin.functions";
import { getEnrollment as getEnrollmentFull } from "@/lib/bursar.functions";
import { DangerConfirm, useDangerConfirm } from "@/components/DangerConfirm";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Dashboard · SchoolConnect" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else setReady(true);
    });
  }, [navigate]);
  if (!ready) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return <AdminShell />;
}

function AdminShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const roleFn = useServerFn(getMyRole);
  const claimFn = useServerFn(claimAdminIfNone);
  const { data: role, isLoading, refetch } = useQuery({ queryKey: ["my-role"], queryFn: () => roleFn() });

  useEffect(() => {
    if (role?.role === "bursar") navigate({ to: "/bursar", replace: true });
  }, [role, navigate]);

  const [tab, setTab] = useState<"info" | "students" | "params">("info");

  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (role?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="card-surface p-8 text-center max-w-md">
          <ShieldAlert className="h-10 w-10 text-warning mx-auto" />
          <h1 className="mt-3 text-xl font-bold">Admin access required</h1>
          {role?.adminCount === 0 ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">No admin exists yet. Claim it now.</p>
              <button onClick={async () => { await claimFn(); toast.success("You are now the admin"); refetch(); }} className="btn-primary mt-4">Claim admin</button>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Ask an existing admin to grant you access.</p>
          )}
          <button onClick={signOut} className="btn-ghost mt-4">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg hero-gradient">
              <GraduationCap className="h-5 w-5" />
            </span>
            Admin Command Board
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{role.full_name}</span>
            <button onClick={signOut} className="btn-ghost"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8 space-y-8">
        <div className="flex gap-2 border-b border-border">
          <TabBtn active={tab === "info"} onClick={() => setTab("info")} icon={InfoIcon} label="School info" />
          <TabBtn active={tab === "students"} onClick={() => setTab("students")} icon={Users} label="Students info" />
          <TabBtn active={tab === "params"} onClick={() => setTab("params")} icon={Settings2} label="School year" />
        </div>

        {tab === "info" && <SchoolInfoTab />}
        {tab === "students" && <StudentsInfoTab />}
        {tab === "params" && <YearParamsTab />}
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: any) {
  return (
    <button onClick={onClick}
      className={"px-4 py-2 flex items-center gap-2 text-sm font-medium border-b-2 -mb-px " + (active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

/* ============ TAB 1 — SCHOOL INFO ============ */
function SchoolInfoTab() {
  const revFn = useServerFn(getRevenueBreakdown);
  const bursarsFn = useServerFn(listBursars);
  const { data: rev } = useQuery({ queryKey: ["revenue"], queryFn: () => revFn() });
  const { data: bursars } = useQuery({ queryKey: ["bursars"], queryFn: () => bursarsFn() });
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal` : "";

  useEffect(() => {
    if (portalUrl) QRCode.toDataURL(portalUrl, { width: 400, margin: 2 }).then(setQrDataUrl);
  }, [portalUrl]);

  function downloadQrPdf() {
    if (!qrDataUrl) return;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text("Demo Academy — Parent Portal", 20, 20);
    doc.setFontSize(11); doc.text("Scan this code to find your child and pay school fees.", 20, 30);
    doc.addImage(qrDataUrl, "PNG", 55, 45, 100, 100);
    doc.setFontSize(10); doc.text(portalUrl, 20, 160);
    doc.save("parent-portal-qr.pdf");
  }

  const total = rev?.total ?? 0;
  const findAmt = (k: string) => rev?.breakdown.find(b => b.key === k)?.amount ?? 0;
  const findPct = (k: string) => rev?.breakdown.find(b => b.key === k)?.pct ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-surface p-5">
          <div className="text-xs uppercase text-muted-foreground">Parent portal QR</div>
          <div className="mt-3 flex items-center gap-4">
            {qrDataUrl ? <img src={qrDataUrl} alt="Portal QR" className="h-32 w-32 rounded-md border border-border" /> : <div className="h-32 w-32 bg-muted rounded-md" />}
            <div className="flex-1">
              <div className="text-sm">Print & display at the school entrance.</div>
              <div className="text-xs text-muted-foreground break-all mt-1">{portalUrl}</div>
              <button onClick={downloadQrPdf} className="btn-primary mt-3 text-sm"><QrCode className="h-4 w-4" /> Download PDF</button>
            </div>
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="text-xs uppercase text-muted-foreground">Total collected (this year)</div>
          <div className="mt-2 text-3xl font-display font-bold">{total.toLocaleString()} XAF</div>
          <div className="mt-4 space-y-2 text-sm">
            <BreakdownRow label="Mobile Money" amount={findAmt("MOBILE_MONEY")} pct={findPct("MOBILE_MONEY")} />
            <BreakdownRow label="Cash" amount={findAmt("CASH")} pct={findPct("CASH")} />
            <BreakdownRow label="Bank" amount={findAmt("BANK")} pct={findPct("BANK")} />
          </div>
        </div>
      </div>

      <BursarsSection bursars={bursars ?? []} />
    </div>
  );
}

function BreakdownRow({ label, amount, pct }: { label: string; amount: number; pct: number }) {
  return (
    <div>
      <div className="flex justify-between"><span>{label}</span><span className="font-mono">{amount.toLocaleString()} XAF · {pct}%</span></div>
      <div className="h-2 bg-muted rounded mt-1 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function BursarsSection({ bursars }: { bursars: any[] }) {
  const fn = useServerFn(createBursar);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fn({ data: form });
      toast.success("Bursar account created");
      setForm({ full_name: "", email: "", password: "" }); setOpen(false);
      qc.invalidateQueries({ queryKey: ["bursars"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-muted-foreground">Bursar accounts</div>
        <button onClick={() => setOpen(!open)} className="btn-outline text-sm"><Plus className="h-4 w-4" /> Deploy bursar</button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-4 grid sm:grid-cols-3 gap-3">
          <input className="input-field" placeholder="Full name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          <input className="input-field" type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <input className="input-field" type="password" placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
          <div className="sm:col-span-3"><button disabled={busy} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}</button></div>
        </form>
      )}
      <div className="mt-4 grid gap-2">
        {bursars.length === 0 && <div className="text-sm text-muted-foreground">No bursars yet.</div>}
        {bursars.map((b: any) => (
          <div key={b.user_id} className="flex justify-between text-sm border border-border rounded-lg p-3">
            <div><div className="font-medium">{b.full_name}</div><div className="text-muted-foreground">{b.email}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ TAB 2 — STUDENTS INFO ============ */
function StudentsInfoTab() {
  const kpiFn = useServerFn(getStudentKpis);
  const rosterFn = useServerFn(listRosterForAdmin);
  const { data: kpis } = useQuery({ queryKey: ["kpis"], queryFn: () => kpiFn() });
  const { data: roster } = useQuery({ queryKey: ["admin-roster"], queryFn: () => rosterFn() });
  const [view, setView] = useState<"flat" | "segmented">("flat");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const yearClosed = !roster?.year || roster.year.status === "CLOSED";
  const rows = (roster?.rows ?? []) as any[];
  const filtered = q.trim() ? rows.filter(r => r.students?.full_name?.toUpperCase().includes(q.trim().toUpperCase())) : rows;

  function exportCsv() {
    const header = "Full name,Matricule,Class,Registered,Tuition paid,Tuition required\n";
    const body = filtered.map((r: any) => [
      r.students?.full_name, r.students?.matricule, r.classes?.name,
      r.is_registered ? "Yes" : "No", r.tuition_paid, r.tuition_required,
    ].join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "roster.csv"; a.click();
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`Roster — ${roster?.year?.label ?? ""}`, 14, 15);
    autoTable(doc, {
      startY: 22,
      head: [["Name", "Matricule", "Class", "Reg.", "Paid", "Required"]],
      body: filtered.map((r: any) => [
        r.students?.full_name, r.students?.matricule, r.classes?.name ?? "",
        r.is_registered ? "Yes" : "No",
        Number(r.tuition_paid).toLocaleString(),
        Number(r.tuition_required).toLocaleString(),
      ]),
    });
    doc.save("roster.pdf");
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total students" value={kpis?.total ?? 0} sub={`${kpis?.newAdmits ?? 0} new · ${kpis?.oldStudents ?? 0} old`} />
        <Kpi label="Registered" value={kpis?.registered ?? 0} />
        <Kpi label="Fee started" value={kpis?.feeStarted ?? 0} />
        <Kpi label="Fee completed" value={kpis?.feeCompleted ?? 0} />
      </div>

      <div className="card-surface p-4 flex gap-2 items-center flex-wrap">
        <input className="input-field flex-1 min-w-[200px]" placeholder="Search by name…" value={q}
          onChange={e => setQ(e.target.value.toUpperCase())} />
        <div className="flex gap-1">
          <button onClick={() => setView("flat")} className={view === "flat" ? "btn-primary text-xs" : "btn-outline text-xs"}>Flat</button>
          <button onClick={() => setView("segmented")} className={view === "segmented" ? "btn-primary text-xs" : "btn-outline text-xs"}>By class</button>
        </div>
        <button onClick={exportCsv} className="btn-outline text-sm"><Download className="h-4 w-4" /> CSV</button>
        <button onClick={exportPdf} className="btn-outline text-sm"><Download className="h-4 w-4" /> PDF</button>
      </div>

      {view === "flat" ? (
        <RosterTable rows={filtered} onOpen={setSelected} yearClosed={yearClosed} />
      ) : (
        (() => {
          const groups = new Map<string, any[]>();
          for (const r of filtered) {
            const key = r.classes?.name ?? "Unassigned";
            const arr = groups.get(key) ?? []; arr.push(r); groups.set(key, arr);
          }
          return (
            <div className="space-y-4">
              {[...groups.entries()].map(([cls, items]) => (
                <div key={cls}>
                  <div className="text-xs uppercase text-muted-foreground mb-2 mt-2">{cls} ({items.length})</div>
                  <RosterTable rows={items} onOpen={setSelected} yearClosed={yearClosed} />
                </div>
              ))}
            </div>
          );
        })()
      )}

      {selected && <StudentProfileDialog enrollment={selected} yearClosed={yearClosed} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="card-surface p-5">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-display font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function RosterTable({ rows, onOpen, yearClosed }: { rows: any[]; onOpen: (r: any) => void; yearClosed: boolean }) {
  return (
    <div className="card-surface p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b border-border">
          <tr><th className="py-2">Student</th><th>Matricule</th><th>Class</th><th>Status</th>{yearClosed && <th>Promotion</th>}<th></th></tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-b border-border hover:bg-muted cursor-pointer" onClick={() => onOpen(r)}>
              <td className="py-2 font-medium">{r.students?.full_name}</td>
              <td className="font-mono text-xs">{r.students?.matricule}</td>
              <td>{r.classes?.name ?? "—"}</td>
              <td>{!r.is_registered ? "Not registered" : Number(r.tuition_paid) >= Number(r.tuition_required) && Number(r.tuition_required) > 0 ? "Fully paid" : Number(r.tuition_paid) > 0 ? "Partial" : "Registered"}</td>
              {yearClosed && <td>{r.promotion_decision ?? "—"}</td>}
              <td className="text-right text-xs text-muted-foreground">Open →</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={yearClosed ? 6 : 5} className="py-8 text-center text-muted-foreground">No students.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function StudentProfileDialog({ enrollment, yearClosed, onClose }: { enrollment: any; yearClosed: boolean; onClose: () => void }) {
  const dismissFn = useServerFn(dismissStudent);
  const promoteFn = useServerFn(setPromotion);
  const qc = useQueryClient();
  const danger = useDangerConfirm();
  const [reason, setReason] = useState("");
  const s = enrollment.students; const c = enrollment.classes;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4" onClick={onClose}>
        <div className="card-surface p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-lg">{s?.full_name}</h3>
              <div className="text-sm text-muted-foreground">{c?.name} · <span className="font-mono">{s?.matricule}</span></div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <InfoField k="Registered" v={enrollment.is_registered ? "Yes" : "No"} />
            <InfoField k="Kind" v={enrollment.enrollment_kind} />
            <InfoField k="Paid" v={`${Number(enrollment.tuition_paid).toLocaleString()} XAF`} />
            <InfoField k="Required" v={`${Number(enrollment.tuition_required).toLocaleString()} XAF`} />
            <InfoField k="Gender" v={s?.gender} />
            <InfoField k="Parent phone" v={s?.parent_phone} />
          </div>

          <hr className="my-5 border-border" />

          {yearClosed ? (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-2">Promotion decision</div>
              <div className="flex gap-2">
                <button onClick={async () => { await promoteFn({ data: { enrollment_id: enrollment.id, decision: "PROMOTED" } }); toast.success("Marked promoted"); qc.invalidateQueries(); onClose(); }} className="btn-primary flex-1"><ArrowUp className="h-4 w-4" /> Promote</button>
                <button onClick={async () => { await promoteFn({ data: { enrollment_id: enrollment.id, decision: "REPEATED" } }); toast.success("Marked repeated"); qc.invalidateQueries(); onClose(); }} className="btn-outline flex-1"><RotateCcw className="h-4 w-4" /> Repeat</button>
              </div>
              {enrollment.promotion_decision && <div className="mt-3 text-xs text-muted-foreground">Current: {enrollment.promotion_decision}</div>}
            </div>
          ) : (
            <button
              onClick={() => danger.ask({
                title: "Dismiss this student?",
                message: "This removes them from the active roster for the current year. They will not appear in searches or the roster. This cannot be casually undone.",
                confirmLabel: "Dismiss student",
                onConfirm: async () => {
                  if (!reason.trim() || reason.length < 3) { toast.error("Enter a reason"); throw new Error("reason"); }
                  await dismissFn({ data: { enrollment_id: enrollment.id, reason } });
                  toast.success("Student dismissed"); qc.invalidateQueries(); onClose();
                },
              })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-destructive text-destructive px-4 py-2 font-semibold hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Dismiss student
            </button>
          )}
          {!yearClosed && (
            <input className="input-field w-full mt-3" placeholder="Reason for dismissal (required)" value={reason} onChange={e => setReason(e.target.value)} />
          )}
        </div>
      </div>
      <DangerConfirm {...danger.props} />
    </>
  );
}

function InfoField({ k, v }: { k: string; v: any }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="mt-0.5 text-sm">{v ?? "—"}</div>
    </div>
  );
}

/* ============ TAB 3 — SCHOOL YEAR ============ */
function YearParamsTab() {
  const fn = useServerFn(getYearParameters);
  const closeFn = useServerFn(closeSchoolYear);
  const queueFn = useServerFn(listPromotionQueue);
  const qc = useQueryClient();
  const danger = useDangerConfirm();
  const { data, isLoading } = useQuery({ queryKey: ["year-params"], queryFn: () => fn() });
  const [subView, setSubView] = useState<"gate" | "promotion" | "wizard">("gate");
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["promotion-queue"], queryFn: () => queueFn(),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;

  const year = data?.year;
  const isOpen = year && year.status === "OPEN";

  if (!isOpen) {
    if (queueLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;
    const rows = (queue?.rows ?? []) as any[];
    const undecided = rows.filter(r => !r.promotion_decision).length;
    const promoted = rows.filter(r => r.promotion_decision === "PROMOTED").length;
    const repeated = rows.filter(r => r.promotion_decision === "REPEATED").length;

    if (subView === "promotion" && queue?.year) {
      return <PromotionQueueView closedYearLabel={queue.year.label} rows={rows} onBack={() => setSubView("gate")} />;
    }
    if (subView === "wizard" && undecided === 0) {
      return <CreateYearWizard hasClosedPrevious={!!year} promoted={promoted} repeated={repeated} onCreated={() => { qc.invalidateQueries(); setSubView("gate"); }} onCancel={() => setSubView("gate")} />;
    }
    return (
      <PromotionGate
        yearLabel={queue?.year?.label ?? year?.label ?? ""}
        undecided={undecided} total={rows.length}
        promoted={promoted} repeated={repeated}
        onOpenPromotion={() => setSubView("promotion")}
        onOpenWizard={() => setSubView("wizard")}
      />
    );
  }

  return (
    <>
      <div className="space-y-5">
        <div className="card-surface p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Current school year</div>
              <div className="mt-1 text-2xl font-display font-bold">{year.label}</div>
              <div className="text-sm text-muted-foreground">Started {year.starts_on} · <span className="chip-success">OPEN</span></div>
            </div>
            <button
              onClick={() => danger.ask({
                title: "Close the school year?",
                message: `This freezes the parent portal and bursar workstation for ${year.label}. Payments stop. You will then set each student's promotion decision before opening the next year. This cannot be casually undone.`,
                confirmLabel: "Close school year",
                onConfirm: async () => { await closeFn(); toast.success("School year closed"); qc.invalidateQueries(); },
              })}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive text-destructive-foreground px-4 py-2 font-semibold">
              <Lock className="h-4 w-4" /> Close school year
            </button>
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="text-xs uppercase text-muted-foreground mb-2">Fee configuration</div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <InfoField k="Structure" v={data?.config?.fee_structure} />
            <InfoField k="Currency" v={data?.config?.currency} />
            <InfoField k="Registration (uniform)" v={`${Number(data?.config?.uniform_registration_fee ?? 0).toLocaleString()}`} />
            <InfoField k="Tuition (uniform)" v={`${Number(data?.config?.uniform_tuition_fee ?? 0).toLocaleString()}`} />
            <InfoField k="Min installment" v={data?.config?.min_installment_amount ? Number(data.config.min_installment_amount).toLocaleString() : "Any partial allowed"} />
            <InfoField k="Settlement account" v={data?.config?.settlement_account} />
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="text-xs uppercase text-muted-foreground mb-2">Levels & sub-classes</div>
          <div className="grid gap-2">
            {(data?.levels ?? []).map((l: any) => (
              <div key={l.id} className="border border-border rounded-lg p-3">
                <div className="font-semibold">{l.name}</div>
                <div className="text-sm text-muted-foreground">
                  {(data?.classes ?? []).filter((c: any) => c.level_id === l.id).map((c: any) => c.name).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="text-xs uppercase text-muted-foreground mb-2">Admission fields</div>
          {(data?.fields ?? []).length === 0
            ? <div className="text-sm text-muted-foreground">No extra admission fields configured.</div>
            : <ul className="text-sm list-disc pl-5">{(data?.fields ?? []).map((f: any) => (
                <li key={f.id}>{f.label} <span className="text-muted-foreground">({f.data_type}{f.is_required ? " · required" : ""})</span></li>
              ))}</ul>
          }
        </div>
      </div>
      <DangerConfirm {...danger.props} />
    </>
  );
}

function CreateYearWizard({ hasClosedPrevious, promoted = 0, repeated = 0, onCreated, onCancel }: { hasClosedPrevious: boolean; promoted?: number; repeated?: number; onCreated: () => void; onCancel?: () => void }) {
  const createFn = useServerFn(createSchoolYear);

  const [step, setStep] = useState(1);
  const [label, setLabel] = useState("");
  const [starts, setStarts] = useState(new Date().toISOString().slice(0, 10));
  const [levels, setLevels] = useState<{ name: string; sort_order: number; subclasses: string[] }[]>([
    { name: "Form 1", sort_order: 1, subclasses: ["Form 1 A"] },
  ]);
  const [fee, setFee] = useState({
    fee_structure: "UNIFORM" as "UNIFORM" | "SEGMENTED",
    currency: "XAF",
    uniform_registration_fee: 25000,
    uniform_tuition_fee: 150000,
    settlement_account: "",
    min_installment_amount: "" as string | number,
  });
  const [fields, setFields] = useState<{ label: string; data_type: any; is_required: boolean; sort_order: number; options?: string[] }[]>([]);
  const [rollForward, setRollForward] = useState(hasClosedPrevious);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!label.trim()) return toast.error("Enter a year label");
    if (levels.some(l => !l.name || l.subclasses.length === 0 || l.subclasses.some(s => !s.trim())))
      return toast.error("All levels need a name and at least one sub-class");
    setBusy(true);
    try {
      await createFn({ data: {
        label, starts_on: starts, levels,
        fee_config: {
          fee_structure: fee.fee_structure, currency: fee.currency,
          uniform_registration_fee: Number(fee.uniform_registration_fee),
          uniform_tuition_fee: Number(fee.uniform_tuition_fee),
          settlement_account: fee.settlement_account || null,
          min_installment_amount: fee.min_installment_amount === "" ? null : Number(fee.min_installment_amount),
        },
        admission_fields: fields.map((f, i) => ({ ...f, sort_order: i + 1, options: f.options ?? null })),
        roll_forward: rollForward,
      }});
      toast.success("School year created");
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card-surface p-6">
      <div className="text-xs uppercase text-muted-foreground">Create school year — step {step} of {hasClosedPrevious ? 6 : 5}</div>

      {step === 1 && (
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <label><span className="text-sm font-medium">Year label</span>
            <input className="input-field w-full mt-1" placeholder="2027/2028" value={label} onChange={e => setLabel(e.target.value)} /></label>
          <label><span className="text-sm font-medium">Start date</span>
            <input type="date" className="input-field w-full mt-1" value={starts} onChange={e => setStarts(e.target.value)} /></label>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-muted-foreground">Add class levels in ascending order (Form 1, Form 2, …).</div>
          {levels.map((l, i) => (
            <div key={i} className="border border-border rounded-lg p-3 grid sm:grid-cols-[1fr_auto] gap-2 items-center">
              <input className="input-field" value={l.name} onChange={e => {
                const cp = [...levels]; cp[i].name = e.target.value; setLevels(cp);
              }} placeholder="Level name" />
              <button onClick={() => setLevels(levels.filter((_, j) => j !== i))} className="btn-ghost text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setLevels([...levels, { name: "", sort_order: levels.length + 1, subclasses: [""] }])} className="btn-outline text-sm"><Plus className="h-4 w-4" /> Add level</button>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-muted-foreground">Add sub-classes (e.g. Form 1 A, Form 1 B) under each level.</div>
          {levels.map((l, i) => (
            <div key={i} className="border border-border rounded-lg p-3">
              <div className="font-semibold text-sm mb-2">{l.name || `Level ${i + 1}`}</div>
              {l.subclasses.map((s, j) => (
                <div key={j} className="flex gap-2 mb-2">
                  <input className="input-field flex-1" value={s} onChange={e => {
                    const cp = [...levels]; cp[i].subclasses[j] = e.target.value; setLevels(cp);
                  }} placeholder={`${l.name} A`} />
                  <button onClick={() => {
                    const cp = [...levels]; cp[i].subclasses = cp[i].subclasses.filter((_, k) => k !== j); setLevels(cp);
                  }} className="btn-ghost text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={() => { const cp = [...levels]; cp[i].subclasses.push(""); setLevels(cp); }} className="btn-outline text-xs"><Plus className="h-3 w-3" /> Sub-class</button>
            </div>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2"><span className="text-sm font-medium">Fee structure</span>
            <select className="input-field w-full mt-1" value={fee.fee_structure} onChange={e => setFee({ ...fee, fee_structure: e.target.value as any })}>
              <option value="UNIFORM">Uniform (one fee across the school)</option>
              <option value="SEGMENTED">Segmented (per level — set later)</option>
            </select></label>
          <label><span className="text-sm font-medium">Registration fee</span>
            <input type="number" className="input-field w-full mt-1" value={fee.uniform_registration_fee} onChange={e => setFee({ ...fee, uniform_registration_fee: Number(e.target.value) })} /></label>
          <label><span className="text-sm font-medium">Tuition fee</span>
            <input type="number" className="input-field w-full mt-1" value={fee.uniform_tuition_fee} onChange={e => setFee({ ...fee, uniform_tuition_fee: Number(e.target.value) })} /></label>
          <label><span className="text-sm font-medium">Currency</span>
            <input className="input-field w-full mt-1" value={fee.currency} onChange={e => setFee({ ...fee, currency: e.target.value })} /></label>
          <label><span className="text-sm font-medium">Settlement account</span>
            <input className="input-field w-full mt-1" value={fee.settlement_account} onChange={e => setFee({ ...fee, settlement_account: e.target.value })} placeholder="MTN MoMo · 6XX…" /></label>
          <label className="sm:col-span-2"><span className="text-sm font-medium">Minimum tuition installment (blank = any partial allowed)</span>
            <input type="number" className="input-field w-full mt-1" value={fee.min_installment_amount} onChange={e => setFee({ ...fee, min_installment_amount: e.target.value })} placeholder="e.g. 25000" /></label>
        </div>
      )}

      {step === 5 && (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-muted-foreground">Extra admission questions. Core fields (name, gender, DOB, place of birth, parent phone, class) are always captured.</div>
          {fields.map((f, i) => (
            <div key={i} className="border border-border rounded-lg p-3 grid sm:grid-cols-4 gap-2 items-end">
              <label className="sm:col-span-2"><span className="text-xs">Label</span>
                <input className="input-field w-full mt-1" value={f.label} onChange={e => {
                  const cp = [...fields]; cp[i].label = e.target.value; setFields(cp);
                }} /></label>
              <label><span className="text-xs">Type</span>
                <select className="input-field w-full mt-1" value={f.data_type} onChange={e => {
                  const cp = [...fields]; cp[i].data_type = e.target.value; setFields(cp);
                }}>
                  <option value="TEXT">Text</option><option value="NUMBER">Number</option>
                  <option value="DATE">Date</option><option value="BOOLEAN">Yes/No</option>
                  <option value="SELECT">Select</option>
                </select></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_required} onChange={e => {
                const cp = [...fields]; cp[i].is_required = e.target.checked; setFields(cp);
              }} /> <span className="text-xs">Required</span></label>
              {f.data_type === "SELECT" && (
                <label className="sm:col-span-4"><span className="text-xs">Options (comma-separated)</span>
                  <input className="input-field w-full mt-1" value={(f.options ?? []).join(", ")} onChange={e => {
                    const cp = [...fields]; cp[i].options = e.target.value.split(",").map(s => s.trim()).filter(Boolean); setFields(cp);
                  }} /></label>
              )}
              <button onClick={() => setFields(fields.filter((_, j) => j !== i))} className="btn-ghost text-destructive sm:col-span-4"><Trash2 className="h-4 w-4" /> Remove</button>
            </div>
          ))}
          <button onClick={() => setFields([...fields, { label: "", data_type: "TEXT", is_required: false, sort_order: fields.length + 1 }])} className="btn-outline text-sm"><Plus className="h-4 w-4" /> Add field</button>
        </div>
      )}

      {step === 6 && hasClosedPrevious && (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 border border-border rounded-lg p-4">
            <input type="checkbox" className="mt-1" checked={rollForward} onChange={e => setRollForward(e.target.checked)} />
            <div>
              <div className="font-semibold text-sm">Roll students forward from last year</div>
              <div className="text-xs text-muted-foreground mt-1">
                About to enroll <b>{promoted}</b> promoted student{promoted === 1 ? "" : "s"} into the next level, and re-enroll <b>{repeated}</b> repeater{repeated === 1 ? "" : "s"} into the same level. They will need to register and pay again.
              </div>
            </div>
          </label>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <div className="flex gap-2">
          <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="btn-ghost">Back</button>
          {onCancel && step === 1 && <button onClick={onCancel} className="btn-ghost">Cancel</button>}
        </div>
        {step < (hasClosedPrevious ? 6 : 5) ? (
          <button onClick={() => setStep(step + 1)} className="btn-primary">Next</button>
        ) : (
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create school year"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============ Promotion gate + queue view ============ */
function PromotionGate({ yearLabel, undecided, total, promoted, repeated, onOpenPromotion, onOpenWizard }: {
  yearLabel: string; undecided: number; total: number; promoted: number; repeated: number;
  onOpenPromotion: () => void; onOpenWizard: () => void;
}) {
  const allDecided = undecided === 0 && total > 0;
  return (
    <div className="card-surface p-6 space-y-4">
      <div>
        <div className="text-xs uppercase text-muted-foreground">School year closed</div>
        <div className="mt-1 text-2xl font-display font-bold">{yearLabel}</div>
      </div>
      {total === 0 ? (
        <div className="text-sm text-muted-foreground">No students carry over from the closed year.</div>
      ) : allDecided ? (
        <div className="rounded-lg border border-border p-4 bg-muted/40">
          <div className="text-sm font-semibold">All promotion decisions are in.</div>
          <div className="text-xs text-muted-foreground mt-1">{promoted} promoted · {repeated} repeated. You can now open the next school year.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-warning/40 p-4 bg-warning/10">
          <div className="text-sm font-semibold text-warning">Promotion decisions still pending</div>
          <div className="text-xs text-muted-foreground mt-1">
            <b>{undecided}</b> of <b>{total}</b> students from {yearLabel} still need a Promote / Repeat decision.
            Students without a decision are <b>not</b> rolled into the next year.
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={onOpenPromotion} className="btn-primary"><ArrowUp className="h-4 w-4" /> Manage promotions</button>
        <button onClick={onOpenWizard} disabled={!allDecided} className="btn-outline disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="h-4 w-4" /> Open next school year
        </button>
      </div>
    </div>
  );
}

function PromotionQueueView({ closedYearLabel, rows, onBack }: { closedYearLabel: string; rows: any[]; onBack: () => void }) {
  const promoteFn = useServerFn(setPromotion);
  const qc = useQueryClient();
  const [onlyUndecided, setOnlyUndecided] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulking, setBulking] = useState(false);

  const total = rows.length;
  const decidedCount = rows.filter(r => r.promotion_decision).length;
  const undecidedRows = rows.filter(r => !r.promotion_decision);
  const shown = onlyUndecided ? undecidedRows : rows;

  async function decide(id: string, decision: "PROMOTED" | "REPEATED") {
    setBusyId(id);
    try {
      await promoteFn({ data: { enrollment_id: id, decision } });
      await qc.invalidateQueries({ queryKey: ["promotion-queue"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }

  async function promoteAllRemaining() {
    if (undecidedRows.length === 0) return;
    setBulking(true);
    try {
      for (const r of undecidedRows) {
        await promoteFn({ data: { enrollment_id: r.id, decision: "PROMOTED" } });
      }
      toast.success(`Promoted ${undecidedRows.length} remaining student${undecidedRows.length === 1 ? "" : "s"}`);
      await qc.invalidateQueries({ queryKey: ["promotion-queue"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBulking(false); }
  }

  return (
    <div className="space-y-4">
      <div className="card-surface p-5 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Promotion queue · {closedYearLabel}</div>
          <div className="mt-1 text-lg font-display font-bold">{decidedCount} of {total} decided</div>
          <div className="text-xs text-muted-foreground">Decisions stay editable until the next year is created.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyUndecided} onChange={e => setOnlyUndecided(e.target.checked)} />
            Only undecided
          </label>
          <button onClick={promoteAllRemaining} disabled={bulking || undecidedRows.length === 0} className="btn-primary text-sm">
            {bulking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            Promote all remaining ({undecidedRows.length})
          </button>
          <button onClick={onBack} className="btn-ghost text-sm">Back</button>
        </div>
      </div>

      <div className="card-surface p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-border">
            <tr><th className="py-2">Student</th><th>Matricule</th><th>Class</th><th>Decision</th><th className="text-right">Action</th></tr>
          </thead>
          <tbody>
            {shown.map((r: any) => {
              const d = r.promotion_decision;
              const isBusy = busyId === r.id;
              return (
                <tr key={r.id} className="border-b border-border">
                  <td className="py-2 font-medium">{r.students?.full_name}</td>
                  <td className="font-mono text-xs">{r.students?.matricule}</td>
                  <td>{r.classes?.name ?? "—"}</td>
                  <td>
                    {d === "PROMOTED" && <span className="chip-success">Promoted</span>}
                    {d === "REPEATED" && <span className="chip-warning">Repeat</span>}
                    {!d && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      <button disabled={isBusy} onClick={() => decide(r.id, "PROMOTED")}
                        className={"text-xs px-2 py-1 rounded-md " + (d === "PROMOTED" ? "bg-primary text-primary-foreground" : "btn-outline")}>
                        <ArrowUp className="h-3 w-3 inline" /> Promote
                      </button>
                      <button disabled={isBusy} onClick={() => decide(r.id, "REPEATED")}
                        className={"text-xs px-2 py-1 rounded-md " + (d === "REPEATED" ? "bg-warning text-warning-foreground" : "btn-outline")}>
                        <RotateCcw className="h-3 w-3 inline" /> Repeat
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">
                {onlyUndecided ? "Every student has a decision. Nice." : "No students in the queue."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
