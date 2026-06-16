import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { GraduationCap, Loader2, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "School staff sign-in — SchoolConnect" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/admin" },
        });
        if (error) throw error;
        toast.success("Account created");
      }
      navigate({ to: "/admin" });
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-3xl mx-auto px-5 py-5 w-full">
        <Link to="/" className="flex items-center gap-2 font-display font-bold">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg hero-gradient">
            <GraduationCap className="h-5 w-5" />
          </span>
          SchoolConnect
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-5">
        <div className="card-surface p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold">School staff portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to manage applications and finance." : "Create your staff account."}
          </p>

          <form onSubmit={submit} className="mt-6 grid gap-4">
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input type="email" required className="input-field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input type="password" required minLength={6} className="input-field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button disabled={loading} className="btn-primary mt-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="h-4 w-4" /> {mode === "signin" ? "Sign in" : "Create account"}</>}
            </button>
          </form>

          <div className="mt-4 text-sm text-center text-muted-foreground">
            {mode === "signin" ? "First time here? " : "Already have an account? "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-primary font-medium">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground border-t border-border pt-4">
            <strong>Demo:</strong> the first account to sign up becomes the school admin automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
