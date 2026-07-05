import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  GraduationCap, LogOut, Loader2, Search, ShieldAlert, Wallet, Users, UserPlus, Printer, Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyRole } from "@/lib/admin.functions";
import {
  getAdmissionSchema, admitStudent, listRoster, staffSearch, bursarPay, getEnrollment, getReceipt,
} from "@/lib/bursar.functions";
import { printReceipt } from "@/lib/receipt";

export const Route = createFileRoute("/bursar")({
  head: () => ({ meta: [{ title: "Bursar Workstation · SchoolConnect" }] }),
  component: BursarPage,
});

function BursarPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else setReady(true);
    });
  }, [navigate]);
  if (!ready) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return <BursarShell />;
}

function BursarShell() {
  const navigate = useNavigate();
  const roleFn = useServerFn(getMyRole);
  const qc = useQueryClient();
  const { data: role, isLoading } = useQuery({ queryKey: ["my-role"], queryFn: () => roleFn() });

  useEffect(() => {
    if (role?.role === "admin") navigate({ to: "/admin", replace: true });
  }, [role, navigate]);

  useEffect(() => {
    const ch = supabase.channel("bursar-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_enrollments" }, () => qc.invalidateQueries())
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_transactions" }, () => qc.invalidateQueries())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const [tab, setTab] = useState<"admit" | "pay">("admit");

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (role?.role !== "bursar") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="card-surface p-8 text-center max-w-md">
          <ShieldAlert className="h-10 w-10 text-warning mx-auto" />
          <h1 className="mt-3 text-xl font-bold">Bursar access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ask the school administrator to deploy a bursar account for you.</p>
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
            Bursar Workstation
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{role.full_name}</span>
            <button onClick={signOut} className="btn-ghost"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8 space-y-8">
        <div className="flex gap-2 border-b border-border">
          <TabBtn active={tab === "admit"} onClick={() => setTab("admit")} icon={UserPlus} label="Admission" />
          <TabBtn active={tab === "pay"} onClick={() => setTab("pay")} icon={Wallet} label="Payment completion" />
        </div>

        {tab === "admit" ? <AdmitTab cashier={role.full_name ?? "Bursar"} /> : <PayTab cashier={role.full_name ?? "Bursar"} />}
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

/* ============ TAB 1 — ADMISSION ============ */
function AdmitTab({ cashier }: { cashier: string }) {
  const schemaFn = useServerFn(getAdmissionSchema);
  const admitFn = useServerFn(admitStudent);
  const qc = useQueryClient();
  const { data: schema, isLoading } = useQuery({ queryKey: ["admission-schema"], queryFn: () => schemaFn() });

  const [form, setForm] = useState({
    full_name: "", gender: "MALE" as "MALE" | "FEMALE" | "OTHER",
    date_of_birth: "", place_of_birth: "", parent_phone: "", class_id: "",
  });
  const [extra, setExtra] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;
  const yearClosed = !schema?.year || schema.year.status === "CLOSED";

  const classesByLevel = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const c of schema?.classes ?? []) {
      const arr = map.get(c.level_id ?? "_") ?? [];
      arr.push(c); map.set(c.level_id ?? "_", arr);
    }
    return map;
  }, [schema]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.date_of_birth || !form.parent_phone || !form.class_id)
      return toast.error("Fill in all required fields");
    // required extras
    for (const f of schema?.fields ?? []) {
      if (f.is_required && (extra[f.id] === undefined || extra[f.id] === "")) {
        return toast.error(`"${f.label}" is required`);
      }
    }
    setBusy(true);
    try {
      const res: any = await admitFn({ data: { ...form, extra_fields: extra } });
      toast.success("Student admitted");
      setForm({ full_name: "", gender: "MALE", date_of_birth: "", place_of_birth: "", parent_phone: "", class_id: "" });
      setExtra({});
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (yearClosed) {
    return (
      <div className="card-surface p-8 text-center">
        <Lock className="h-8 w-8 mx-auto text-warning" />
        <h2 className="mt-3 font-semibold">Admission is closed</h2>
        <p className="text-sm text-muted-foreground mt-1">The current school year is closed. Ask the administrator to open a new year before admitting students.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface p-6">
      <h2 className="font-semibold text-lg">Admit a new student</h2>
      <p className="text-sm text-muted-foreground">Creates the student record instantly, assigns a matricule, and enrolls them in {schema?.year?.label}.</p>

      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <Field label="Full name*"><input required className="input-field w-full" value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value.toUpperCase() })} /></Field>
        <Field label="Gender*">
          <select className="input-field w-full" value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as any })}>
            <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Date of birth*"><input required type="date" className="input-field w-full" value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
        <Field label="Place of birth"><input className="input-field w-full" value={form.place_of_birth}
          onChange={(e) => setForm({ ...form, place_of_birth: e.target.value })} /></Field>
        <Field label="Parent phone*"><input required className="input-field w-full" placeholder="+237 6XX XXX XXX"
          value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></Field>
        <Field label="Class (sub-class)*">
          <select required className="input-field w-full" value={form.class_id}
            onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
            <option value="">Select a class</option>
            {(schema?.levels ?? []).map((l: any) => (
              <optgroup key={l.id} label={l.name}>
                {(classesByLevel.get(l.id) ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </div>

      {(schema?.fields ?? []).length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase text-muted-foreground mb-2">Admission details (this year)</div>
          <div className="grid sm:grid-cols-2 gap-4">
            {(schema?.fields ?? []).map((f: any) => (
              <Field key={f.id} label={f.label + (f.is_required ? "*" : "")}>
                {f.data_type === "SELECT" ? (
                  <select className="input-field w-full" value={extra[f.id] ?? ""}
                    onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value })}>
                    <option value="">Select</option>
                    {(Array.isArray(f.options) ? f.options : []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.data_type === "BOOLEAN" ? (
                  <select className="input-field w-full" value={String(extra[f.id] ?? "")}
                    onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value === "true" })}>
                    <option value="">Select</option><option value="true">Yes</option><option value="false">No</option>
                  </select>
                ) : (
                  <input className="input-field w-full"
                    type={f.data_type === "DATE" ? "date" : f.data_type === "NUMBER" ? "number" : "text"}
                    value={extra[f.id] ?? ""}
                    onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value })} />
                )}
              </Field>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Admit student</>}
        </button>
      </div>
    </form>
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

/* ============ TAB 2 — PAYMENT COMPLETION ============ */
function PayTab({ cashier }: { cashier: string }) {
  const rosterFn = useServerFn(listRoster);
  const searchFn = useServerFn(staffSearch);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["roster"], queryFn: () => rosterFn() });
  const [view, setView] = useState<"flat" | "segmented">("flat");
  const [q, setQ] = useState("");
  const [searchRows, setSearchRows] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const yearClosed = !data?.year || data.year.status === "CLOSED";
  const rows = data?.rows ?? [];

  async function doSearch() {
    if (!q.trim()) { setSearchRows(null); return; }
    try { setSearchRows(await searchFn({ data: { q: q.trim() } })); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-5">
      {yearClosed && (
        <div className="card-surface p-4 flex items-center gap-3 border-warning border">
          <Lock className="h-5 w-5 text-warning" />
          <div className="text-sm">School year is closed. Roster is read-only — no payments can be recorded until a new year is opened.</div>
        </div>
      )}

      <div className="card-surface p-4">
        <div className="flex gap-2">
          <input className="input-field flex-1" placeholder="Search by name (typo-tolerant)…" value={q}
            onChange={(e) => setQ(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && doSearch()} />
          <button onClick={doSearch} className="btn-primary"><Search className="h-4 w-4" /> Search</button>
          {searchRows && <button onClick={() => { setSearchRows(null); setQ(""); }} className="btn-ghost">Clear</button>}
        </div>
      </div>

      {searchRows ? (
        <RosterFlat title={`Results (${searchRows.length})`} items={searchRows.map((r: any) => ({
          id: r.enrollment_id, full_name: r.full_name, matricule: r.matricule,
          class_name: r.class_name, level_name: r.level_name,
          is_registered: r.is_registered, tuition_paid: Number(r.tuition_paid), tuition_required: Number(r.tuition_required),
        }))} onOpen={setSelected} />
      ) : (
        <>
          <div className="flex gap-2 items-center">
            <div className="text-xs uppercase text-muted-foreground">View</div>
            <div className="flex gap-1">
              <button onClick={() => setView("flat")} className={view === "flat" ? "btn-primary text-xs" : "btn-outline text-xs"}>Flat</button>
              <button onClick={() => setView("segmented")} className={view === "segmented" ? "btn-primary text-xs" : "btn-outline text-xs"}>By class</button>
            </div>
          </div>
          {view === "flat"
            ? <RosterFlat title={`Roster (${rows.length})`} items={rows.map((r: any) => enrToItem(r))} onOpen={setSelected} />
            : <RosterSegmented rows={rows} onOpen={setSelected} />}
        </>
      )}

      {selected && (
        <ProfileDialog enrollmentId={selected} onClose={() => setSelected(null)}
          cashier={cashier} readOnly={yearClosed}
          onPaid={() => { qc.invalidateQueries(); }} />
      )}
    </div>
  );
}

function enrToItem(r: any) {
  return {
    id: r.id, full_name: r.students?.full_name, matricule: r.students?.matricule,
    class_name: r.classes?.name, level_name: r.classes?.class_levels?.name,
    is_registered: r.is_registered, tuition_paid: Number(r.tuition_paid), tuition_required: Number(r.tuition_required),
  };
}
function itemStatus(i: any): string {
  if (!i.is_registered) return "Not registered";
  if (i.tuition_paid <= 0) return "Registered · fee owed";
  if (i.tuition_paid >= i.tuition_required && i.tuition_required > 0) return "Fully paid";
  return "Fee partial";
}
function itemOwed(i: any) { return Math.max(0, i.tuition_required - i.tuition_paid); }

function RosterFlat({ title, items, onOpen }: { title: string; items: any[]; onOpen: (id: string) => void }) {
  return (
    <div className="card-surface p-5 overflow-x-auto">
      <div className="text-xs uppercase text-muted-foreground mb-2">{title}</div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b border-border">
          <tr><th className="py-2">Student</th><th>Matricule</th><th>Class</th><th>Status</th><th className="text-right">Fee left</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} onClick={() => onOpen(i.id)} className="border-b border-border cursor-pointer hover:bg-muted">
              <td className="py-2 font-medium">{i.full_name}</td>
              <td className="font-mono text-xs">{i.matricule}</td>
              <td>{i.class_name ?? "—"}</td>
              <td>{itemStatus(i)}</td>
              <td className="text-right font-mono">{itemOwed(i).toLocaleString()}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No students.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function RosterSegmented({ rows, onOpen }: { rows: any[]; onOpen: (id: string) => void }) {
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const key = r.classes?.name ?? "Unassigned";
    const arr = groups.get(key) ?? [];
    arr.push(r); groups.set(key, arr);
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([cls, items]) => (
        <RosterFlat key={cls} title={cls + ` (${items.length})`} items={items.map(enrToItem)} onOpen={onOpen} />
      ))}
    </div>
  );
}

function ProfileDialog({ enrollmentId, cashier, readOnly, onClose, onPaid }: {
  enrollmentId: string; cashier: string; readOnly?: boolean;
  onClose: () => void; onPaid: () => void;
}) {
  const getFn = useServerFn(getEnrollment);
  const payFn = useServerFn(bursarPay);
  const { data: enr, isLoading } = useQuery({
    queryKey: ["enr", enrollmentId], queryFn: () => getFn({ data: { enrollment_id: enrollmentId } }),
  });
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<"CASH" | "BANK">("CASH");
  const [type, setType] = useState<"REGISTRATION" | "TUITION">("REGISTRATION");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enr) return;
    if (!enr.is_registered) { setType("REGISTRATION"); setAmount(Number(enr.tuition_required) > 0 ? 0 : 0); }
    else { setType("TUITION"); setAmount(Math.max(0, Number(enr.tuition_required) - Number(enr.tuition_paid))); }
  }, [enr]);

  async function submit() {
    if (amount <= 0) return toast.error("Amount must be positive");
    setBusy(true);
    try {
      const res: any = await payFn({ data: { enrollment_id: enrollmentId, type, amount, payment_method: method } });
      printReceipt({
        reference: res.reference, created_at: new Date().toISOString(), type, amount,
        payment_method: method, payment_phone: null,
        student_name: (enr as any).students?.full_name,
        student_matricule: (enr as any).students?.matricule,
        class_name: (enr as any).classes?.name, cashier,
      });
      toast.success("Payment recorded · receipt printed");
      onPaid(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="card-surface p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {isLoading || !enr ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : (() => {
          const s: any = (enr as any).students;
          const c: any = (enr as any).classes;
          const owed = Math.max(0, Number((enr as any).tuition_required) - Number((enr as any).tuition_paid));
          return (
            <div>
              <h3 className="font-bold text-lg">{s?.full_name}</h3>
              <div className="text-sm text-muted-foreground">{c?.name} · <span className="font-mono">{s?.matricule}</span></div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info k="Registered" v={(enr as any).is_registered ? "Yes" : "No"} />
                <Info k="Fee remaining" v={`${owed.toLocaleString()} XAF`} />
                <Info k="Paid" v={`${Number((enr as any).tuition_paid).toLocaleString()} XAF`} />
                <Info k="Required" v={`${Number((enr as any).tuition_required).toLocaleString()} XAF`} />
              </div>

              {readOnly ? (
                <div className="mt-5 chip-warning"><Lock className="h-4 w-4" /> Year is closed — no payments</div>
              ) : (
                <div className="mt-5 grid gap-3">
                  <div className="text-xs uppercase text-muted-foreground">Record payment (cash / bank only)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type">
                      <select className="input-field w-full" value={type} disabled={!(enr as any).is_registered}
                        onChange={(e) => setType(e.target.value as any)}>
                        <option value="REGISTRATION">Registration</option>
                        <option value="TUITION">Tuition</option>
                      </select>
                    </Field>
                    <Field label="Method">
                      <select className="input-field w-full" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                        <option value="CASH">Cash</option><option value="BANK">Bank transfer</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Amount (XAF)">
                    <input type="number" className="input-field w-full" value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))} />
                  </Field>
                  <div className="flex gap-2">
                    <button onClick={submit} disabled={busy} className="btn-primary flex-1">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Printer className="h-4 w-4" /> Settle & print</>}
                    </button>
                    <button onClick={onClose} className="btn-ghost">Close</button>
                  </div>
                </div>
              )}
              {readOnly && <button onClick={onClose} className="btn-ghost mt-4 w-full">Close</button>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: any }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="mt-0.5 text-sm">{v ?? "—"}</div>
    </div>
  );
}
