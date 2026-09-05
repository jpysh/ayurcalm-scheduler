import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(res.status === 429 ? "Server busy: rate limit exceeded" : (data?.error || "Invalid credentials"));
        return;
      }
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authRole", data.user?.role === "admin" ? "Admin" : "Staff");
      localStorage.setItem("authUser", data.user?.email ?? username.trim());
      toast.success(`Welcome, ${data.user?.name || data.user?.email}`);
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
      toast.error("Unable to reach server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-2 py-1 md:px-3 md:py-2">
          <div className="grid grid-cols-2 items-center">
            <h1 className="text-sm md:text-lg font-bold justify-self-start">Ayurveda Scheduler</h1>
            <div className="justify-self-end">
              <Button
                variant="outline"
                size="icon"
                aria-label="Help"
                className="h-6 w-6"
                onClick={() => { window.open('https://github.com/jpysh/ayurcalm-scheduler#readme', '_blank', 'noopener'); }}
              >
                <HelpCircle className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-center p-1">
        <Card className="w-full max-w-xs shadow-sm mt-4">
          <CardContent className="pt-3">
            <form onSubmit={handleLogin} className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="username" className="text-sm">Email</Label>
                <Input
                  id="username"
                  type="email"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full h-9 text-sm font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Demo login: <span className="font-mono">admin@example.com</span> / <span className="font-mono">demo1234</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
