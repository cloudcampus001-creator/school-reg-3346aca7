import { AlertTriangle } from "lucide-react";
import { useState } from "react";

export function DangerConfirm({
  open, title, message, confirmLabel = "Confirm", extraInput, onConfirm, onClose, busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  extraInput?: { label: string; placeholder?: string; value: string; onChange: (v: string) => void };
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border-2 border-destructive bg-destructive/10 backdrop-blur p-6"
        style={{ background: "rgba(220,38,38,0.08)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-destructive/20 p-2 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-destructive">{title}</h3>
            <p className="mt-2 text-sm">{message}</p>
            {extraInput && (
              <label className="block mt-4 text-sm">
                <span className="font-medium">{extraInput.label}</span>
                <input className="input-field mt-1 w-full" placeholder={extraInput.placeholder}
                  value={extraInput.value} onChange={(e) => extraInput.onChange(e.target.value)} />
              </label>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={busy}>Cancel</button>
          <button onClick={onConfirm} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive text-destructive-foreground px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-50">
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useDangerConfirm() {
  const [state, setState] = useState<null | { title: string; message: string; confirmLabel?: string; onConfirm: () => Promise<void> | void }>(null);
  const [busy, setBusy] = useState(false);
  return {
    open: !!state,
    props: state
      ? {
          open: true, busy, ...state,
          onClose: () => (busy ? null : setState(null)),
          onConfirm: async () => {
            setBusy(true);
            try { await state.onConfirm(); setState(null); } finally { setBusy(false); }
          },
        }
      : { open: false, title: "", message: "", onConfirm: () => {}, onClose: () => {} },
    ask: (cfg: { title: string; message: string; confirmLabel?: string; onConfirm: () => Promise<void> | void }) => setState(cfg),
  };
}
