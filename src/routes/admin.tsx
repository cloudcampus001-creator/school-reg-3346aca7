import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  GraduationCap, LogOut, Inbox, CheckCircle2, XCircle, Clock, Loader2,
  Wallet, Printer, ShieldAlert, Bluetooth,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyAdminStatus, claimAdminIfNone, listApplications, setApplicationStatus,
  getFinanceSummary, listPrintJobs, markPrintJobPrinted,
} from "@/lib/admin.functions";
import { printToThermal, isWebBluetoothSupported } from "@/lib/thermal-printer";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · SchoolConnect" }] }),
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

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  return <AdminShell />;
}

function AdminShell() {
  const navigate = useNavigate();
  const statusFn = useServerFn(getMyAdminStatus);
  const claimFn = useServerFn(claimAdminIfNone);
  const qc = useQueryClient();
  const { data: roleData, isLoading } = useQuery({
    queryKey: ["my-admin-status"],
    queryFn: () => statusFn(),
  });

  const claim = useMutation({
    mutationFn: () => claimFn(),
    onSuccess: () => { toast.success("You're now the school admin."); qc.invalidateQueries({ queryKey: ["my-admin-status"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const [tab, setTab] = useState<"apps" | "finance" | "print">("apps");

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg hero-gradient">
              <GraduationCap className="h-5 w-5" />
            </span>
            SchoolConnect · Admin
          </Link>
          <button onClick={signOut} className="btn-ghost"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {!roleData?.isAdmin && (
          <div className="card-surface p-8 text-center max-w-lg mx-auto">
            <ShieldAlert className="h-10 w-10 text-warning mx-auto" />
            <h1 className="mt-3 text-xl font-bold">No admin access yet</h1>
            {roleData?.adminCount === 0 ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  No admin exists for Demo Academy. Claim the role to bootstrap the system.
                </p>
                <button onClick={() => claim.mutate()} disabled={claim.isPending} className="btn-primary mt-5">
                  {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim admin role"}
                </button>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                An admin already exists. Ask them to grant you access.
              </p>
            )}
          </div>
        )}

        {roleData?.isAdmin && (
          <>
            <nav className="flex gap-2 mb-6 flex-wrap">
              {[
                { k: "apps" as const, l: "Applications", icon: Inbox },
                { k: "finance" as const, l: "Finance", icon: Wallet },
                { k: "print" as const, l: "Print queue", icon: Printer },
              ].map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)}
                  className={"inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition " +
                    (tab === t.k ? "bg-primary text-primary-foreground shadow-soft" : "bg-surface border border-border hover:border-primary")}>
                  <t.icon className="h-4 w-4" /> {t.l}
                </button>
              ))}
            </nav>
            {tab === "apps" && <ApplicationsTab />}
            {tab === "finance" && <FinanceTab />}
            {tab === "print" && <PrintTab />}
          </>
        )}
      </main>
    </div>
  );
}

/* ----------- Applications ----------- */
function ApplicationsTab() {
  const list = useServerFn(listApplications);
  const setStatus = useServerFn(setApplicationStatus);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"PENDING_REVIEW" | "APPROVED" | "REJECTED" | "ALL">("PENDING_REVIEW");
  const { data, isLoading } = useQuery({
    queryKey: ["apps", filter],
    queryFn: () => list({ data: { status: filter } }),
  });

  // realtime invalidate
  useEffect(() => {
    const ch = supabase.channel("admin-students")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => qc.invalidateQueries({ queryKey: ["apps"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const mutate = useMutation({
    mutationFn: (vars: { student_id: string; status: "APPROVED" | "REJECTED" | "PENDING_REVIEW" }) =>
      setStatus({ data: vars }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["apps"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["PENDING_REVIEW", "APPROVED", "REJECTED", "ALL"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={"px-3 py-1.5 rounded-full text-sm font-medium transition " + (filter === f ? "bg-primary text-primary-foreground" : "bg-surface border border-border")}>
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
      {data && data.length === 0 && <div className="card-surface p-8 text-center text-muted-foreground">No applications.</div>}

      <div className="grid gap-3">
        {data?.map((s: any) => {
          const chip = s.application_status === "APPROVED" ? "chip-success" : s.application_status === "REJECTED" ? "chip-danger" : "chip-warning";
          const Icon = s.application_status === "APPROVED" ? CheckCircle2 : s.application_status === "REJECTED" ? XCircle : Clock;
          return (
            <div key={s.id} className="card-surface p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{s.full_name}</div>
                <div className="text-sm text-muted-foreground">
                  {s.classes?.name} · {s.gender} · DOB {s.date_of_birth} · {s.parent_phone}
                </div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">{s.matricule ?? "no matricule yet"}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={chip}><Icon className="h-3.5 w-3.5" />{s.application_status.replace("_", " ")}</span>
                {s.application_status !== "APPROVED" && (
                  <button onClick={() => mutate.mutate({ student_id: s.id, status: "APPROVED" })} className="btn-primary text-sm">Approve</button>
                )}
                {s.application_status !== "REJECTED" && (
                  <button onClick={() => mutate.mutate({ student_id: s.id, status: "REJECTED" })} className="btn-outline text-sm">Reject</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------- Finance ----------- */
function FinanceTab() {
  const fn = useServerFn(getFinanceSummary);
  const { data, isLoading } = useQuery({ queryKey: ["finance"], queryFn: () => fn() });
  if (isLoading || !data) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total collected" value={`${data.totalCollected.toLocaleString()} XAF`} />
        <Kpi label="Registration revenue" value={`${data.totalRegistration.toLocaleString()} XAF`} />
        <Kpi label="Tuition revenue" value={`${data.totalTuition.toLocaleString()} XAF`} />
        <Kpi label="Registered students" value={`${data.counts.registered} / ${data.counts.total}`} />
      </div>

      <div className="card-surface overflow-hidden">
        <div className="p-4 font-semibold">Recent transactions</div>
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Student</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Method</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Ref</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t: any) => (
              <tr key={t.reference} className="border-t border-border">
                <td className="p-3">{new Date(t.created_at).toLocaleString()}</td>
                <td className="p-3">{t.students?.full_name} <span className="font-mono text-xs text-muted-foreground">{t.students?.matricule}</span></td>
                <td className="p-3">{t.type}</td>
                <td className="p-3">{t.payment_method.replace("_", " ")}</td>
                <td className="p-3 text-right font-mono">{Number(t.amount).toLocaleString()}</td>
                <td className="p-3 font-mono text-xs">{t.reference}</td>
              </tr>
            ))}
            {data.transactions.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No transactions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface p-5">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

/* ----------- Print Queue ----------- */
function PrintTab() {
  const list = useServerFn(listPrintJobs);
  const mark = useServerFn(markPrintJobPrinted);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["print-jobs"], queryFn: () => list() });
  const m = useMutation({
    mutationFn: (id: string) => mark({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["print-jobs"] }),
  });

  async function printAndMark(j: any) {
    try {
      if (!isWebBluetoothSupported()) {
        toast.error("Web Bluetooth not available in this browser.");
        return;
      }
      await printToThermal(j.content);
      m.mutate(j.id);
      toast.success("Printed");
    } catch (e: any) { toast.error(e.message); }
  }

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;
  return (
    <div className="grid lg:grid-cols-2 gap-3">
      {data?.length === 0 && <div className="card-surface p-8 text-center text-muted-foreground col-span-2">No print jobs.</div>}
      {data?.map((j: any) => (
        <div key={j.id} className="card-surface p-5">
          <div className="flex items-center justify-between">
            <span className={j.status === "PRINTED" ? "chip-success" : "chip-warning"}>
              {j.status === "PRINTED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {j.status}
            </span>
            <span className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</span>
          </div>
          <pre className="mt-3 rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre overflow-x-auto max-h-60">{j.content}</pre>
          <div className="mt-3 flex gap-2">
            {j.status !== "PRINTED" && (
              <>
                <button onClick={() => printAndMark(j)} className="btn-primary text-sm"><Bluetooth className="h-4 w-4" /> Print via Bluetooth</button>
                <button onClick={() => m.mutate(j.id)} className="btn-outline text-sm">Mark printed</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
