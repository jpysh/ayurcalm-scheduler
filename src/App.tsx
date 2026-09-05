import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import StaffSchedule from "./pages/StaffSchedule";
import PatientView from "./pages/PatientView";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import Ailments from "./pages/Ailments";
import SetupWizard from "./pages/SetupWizard";
import { SupportButton } from "@/components/SupportButton";
import { API_BASE } from "@/lib/apiBase";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  // Presence of a token only decides which screen renders; the server verifies
  // it on every request, so a forged localStorage entry gets 401s and nothing else.
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const App = () => {
  const [serverOk, setServerOk] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  type FeedbackItem = { id?: string; old_value?: Record<string, unknown>; new_value?: Record<string, unknown>; timestamp?: string };
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [showMoreFeedback, setShowMoreFeedback] = useState(false);


  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    const ping = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${API_BASE}/health`, { cache: "no-store", signal: controller.signal });
        let ok = res.ok;
        const j = await res.clone().json().catch(() => null as unknown);
        ok = j ? !!(j as { ok?: boolean }).ok : ok;
        if (!cancel) {
          setServerOk(ok);
        }
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        if (!cancel) setServerOk(false);
      } finally {
        clearTimeout(timer);
      }
    };
    ping();
    const intervalMs = serverOk ? 240000 : 15000;
    const id = setInterval(ping, intervalMs);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [serverOk]);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!feedbackOpen) return;
      setFeedbackLoading(true);
      try {
        const res = await fetch(`${API_BASE}/feedback`);
        const j = await res.json().catch(() => []);
        if (!cancel) setFeedbackItems(Array.isArray(j) ? j : []);
      } catch {
        if (!cancel) setFeedbackItems([]);
      } finally {
        if (!cancel) setFeedbackLoading(false);
      }
    };
    load();
    return () => { cancel = true; };
  }, [feedbackOpen]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <div className="min-h-screen flex flex-col">
          {!serverOk && (
            <div className="border-b border-destructive/40 bg-destructive/10">
              <div className="container mx-auto px-3 py-2">
                <Alert variant="destructive" className="m-0">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Persistence Error</AlertTitle>
                  <AlertDescription>
                    {isOnline ? "Database connection is unavailable. Your changes may not save." : "You are offline. Please check your network."}
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          )}
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/index" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/setup" element={<ProtectedRoute><SetupWizard /></ProtectedRoute>} />
              <Route path="/:username/schedule" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/staff" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/rooms" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/therapies" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/diet" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/timeoff" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/events" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/patients" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/settings" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/ailments" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/dashboard/*" element={<Navigate to="/admin/schedule" replace />} />
              <Route path="/staff/:token" element={<StaffSchedule />} />
              <Route path="/patient/:token" element={<PatientView />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <SupportButton />
          </BrowserRouter>
          <footer className="border-t border-border bg-muted/20">
            <div className="container mx-auto px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                <DialogTrigger asChild>
                  <Button variant="link" className="p-0 h-auto text-xs">Feedback</Button>
                </DialogTrigger>
                <DialogContent hideClose className="p-2 sm:p-3 gap-2 w-[94vw]">
                  <div className="mx-auto w-full max-w-[280px] sm:max-w-[360px] md:max-w-[640px] lg:max-w-[800px]">
                  <DialogHeader className="p-0 m-0 space-y-0 flex flex-row items-center justify-between gap-1 flex-nowrap">
                    <DialogTitle className="text-sm leading-tight m-0 truncate flex-1">Feedback</DialogTitle>
                    <DialogClose asChild>
                      <Button variant="ghost" className="h-7 px-2 text-[12px] shrink-0 whitespace-nowrap">✕</Button>
                    </DialogClose>
                  </DialogHeader>
                  <div className="space-y-1">
                    <Textarea
                      placeholder="Describe the issue or suggestion"
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      rows={2}
                      className="text-xs leading-tight resize-none w-full"
                    />
                    <p className="text-[11px] leading-tight text-muted-foreground m-0">We capture page and basic context to help triage.</p>
                    <div className="mt-2">
                      <div className="text-[11px] leading-tight text-muted-foreground mb-1">Recent feedback</div>
                      <div className="rounded-md border overflow-hidden">
                        <Table className="text-[12px] md:text-sm w-full md:table-auto">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8 md:w-10 h-8">No.</TableHead>
                              <TableHead className="w-12 md:w-16 h-8">Date</TableHead>
                              <TableHead className="h-8">Description</TableHead>
                              <TableHead className="w-20 md:w-24 h-8">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {feedbackLoading && (
                              <TableRow><TableCell className="py-1" colSpan={3}>Loading…</TableCell></TableRow>
                            )}
                            {!feedbackLoading && feedbackItems.slice(0, showMoreFeedback ? 20 : 5).map((item, idx) => {
                              const p = item.old_value || {};
                              const s = item.new_value || {};
                              const desc = String(p.message || '').slice(0, 60);
                              const status = String(s.status || 'submitted');
                              const eta = s.eta_date ? `ETA: ${s.eta_date}` : '';
                              const t = item.timestamp || p.timestamp || new Date().toISOString();
                              const dt = new Date(t);
                              const dd = String(dt.getDate()).padStart(2,'0');
                              const mm = String(dt.getMonth()+1).padStart(2,'0');
                              return (
                                <TableRow key={item.id || idx}>
                                  <TableCell className="py-1">{idx + 1}</TableCell>
                                  <TableCell className="py-1">{dd}/{mm}</TableCell>
                                  <TableCell className="py-1 whitespace-normal break-words">{desc}</TableCell>
                                  <TableCell className="py-1">{status === 'eta' ? eta || 'ETA' : status === 'done' ? 'Done' : 'Submitted'}</TableCell>
                                </TableRow>
                              );
                            })}
                            {!feedbackLoading && feedbackItems.length === 0 && (
                              <TableRow><TableCell className="py-1" colSpan={3}>No feedback yet</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      {feedbackItems.length > 5 && (
                        <div className="mt-1 flex justify-end">
                          <Button variant="link" className="p-0 h-auto text-[11px]" onClick={() => setShowMoreFeedback((v) => !v)}>
                            {showMoreFeedback ? "See less" : "See more"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter className="p-0 m-0 flex justify-center">
                    <Button
                      variant="default"
                      onClick={async () => {
                        const role = typeof window !== "undefined" ? localStorage.getItem("authRole") : null;
                        const payload = {
                          message: feedbackText,
                          page: typeof window !== "undefined" ? window.location.pathname : "/",
                          url: typeof window !== "undefined" ? window.location.href : "",
                          role: role,
                          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                          viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : null,
                          timestamp: new Date().toISOString(),
                        };
                        try {
                          const res = await fetch(`${API_BASE}/feedback`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                          });
                          const isOk = res.ok || res.status === 201 || res.status === 204;
                          if (!isOk) {
                            const bodyText = await res.text().catch(() => "");
                            toast({ title: "Error", description: `Could not submit feedback (${res.status}).` });
                            return;
                          }
                          const data = await res.json().catch(() => null as unknown as { id?: string } | null);
                          const newItem: FeedbackItem = {
                            id: (data as { id?: string } | null)?.id || String(Date.now()),
                            old_value: payload,
                            new_value: { status: "submitted" },
                            timestamp: new Date().toISOString(),
                          };
                          setFeedbackItems((prev) => [newItem, ...prev]);
                          toast({ title: "Submitted", description: "Thanks!", duration: 2000 });
                          setFeedbackText("");
                        } catch (e) {
                          toast({ title: "Error", description: "Could not submit feedback.", duration: 2000 });
                        }
                      }}
                      disabled={!feedbackText.trim()}
                      className="h-7 px-3 text-[12px] w-full max-w-[280px] justify-center whitespace-nowrap"
                    >Submit</Button>
                  </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="text-center flex-1">Designed by GGP</div>
            </div>
          </footer>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
