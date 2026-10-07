import { useEffect, useState } from "react";
import { useCentreName, useDemo, useTrial } from "@/lib/centreName";
import { useNavigate } from "react-router-dom";
import { Btn, Callout, FullPage, More, QuietLink, Text } from "@/components/kit";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

const Login = () => {
  const centreName = useCentreName();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const demo = useDemo();
  const trial = useTrial();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    signIn("login", { email: username.trim(), password });
  };

  // The emailed sign-in link of a new cloud trial (#247): /login#link=<token>.
  useEffect(() => {
    const link = new URLSearchParams(window.location.hash.slice(1)).get("link");
    if (!link) return;
    history.replaceState(null, "", "/login");
    signIn("link", { token: link });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (path: "login" | "link", body: object) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(res.status === 429 ? (data?.error || "Too many tries. Wait a few minutes and try again.") : (data?.error || "That email and password do not match."));
        return;
      }
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authRole", data.user?.role === "admin" ? "Admin" : "Staff");
      localStorage.setItem("authUser", data.user?.email ?? username.trim());
      // An administrator lands in the setup wizard until the centre's details
      // have been filled in once.
      if (data.user?.role === "admin") {
        const settings = await fetch(`${API_BASE}/settings`, {
          headers: { Authorization: `Bearer ${data.token}` },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (settings && settings.setup_complete === false) {
          navigate("/setup");
          return;
        }
      }
      navigate(data.user?.role === "admin" ? "/admin/schedule" : "/staff/schedule");
    } catch {
      toast.error("Could not reach the server. Check the connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <FullPage title={centreName} note="Sign in to the centre's schedule.">
      {demo && (
        <div className="mt-4">
          <Callout tone="notice" title="This is a demo" actions={<Btn kind="primary" inline disabled={isLoading} onClick={() => signIn("login", { email: demo.email, password: demo.password })}>Open the demo</Btn>}>
            Sign in with <span className="font-mono">{demo.email} / {demo.password}</span>
          </Callout>
        </div>
      )}
      <form onSubmit={handleLogin} className="mt-2">
        <Text label="Email" type="email" inputMode="email" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <Text label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="mt-5"><Btn kind="primary" type="submit" disabled={isLoading}>{isLoading ? "Signing in…" : "Sign in"}</Btn></div>
      </form>
      {trial ? (
        // No email at launch (#247): the maintainer sets a new password and sends it back.
        <More label="Forgotten your password?" hint="">
          <p className="py-2 text-sm">
            <QuietLink className="underline" href={`https://wa.me/420777558262?text=${encodeURIComponent(`Please reset the password for ${window.location.host}`)}`}>WhatsApp us</QuietLink> from your phone and we will send you a new one, usually within a few hours.
          </p>
        </More>
      ) : (
        <More label="Forgotten your password?" hint="">
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>Ask an administrator to set a new one from Settings.</p>
            <p>If you are the only administrator, run this on the machine hosting the app:</p>
            <code className="block break-all rounded-xl bg-secondary px-3 py-2 font-mono text-sm text-foreground">docker compose exec app npx tsx server/src/scripts/resetPassword.ts your@email.com</code>
            <p>It prints a new password for you.</p>
          </div>
        </More>
      )}
      {trial ? (
        // Pilot notice and contacts (#251): who runs a cloud centre and how to reach them.
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <a className="underline" href="https://jains.es/ruta/pilot">Pilot notice: your data</a> · <a className="underline" href="https://wa.me/420777558262">WhatsApp</a> · <a className="underline" href="mailto:helloayursen@gmail.com">helloayursen@gmail.com</a>
        </p>
      ) : null}
      <div className="mt-4 text-center"><QuietLink href="https://github.com/jpysh/ayurcalm-scheduler#readme" target="_blank" rel="noopener noreferrer">Help</QuietLink></div>
    </FullPage>
  );
};

export default Login;
