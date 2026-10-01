import { ConfirmHost } from "@/components/ConfirmSheet";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { Callout } from "@/components/kit";
import { DemoBanner } from "@/components/DemoBanner";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LinkView from "./pages/LinkView";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import SetupWizard from "./pages/SetupWizard";
import { API_BASE } from "@/lib/apiBase";


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


  return (
    <>
        <Sonner />
        <ConfirmHost />
        <div className="min-h-screen flex flex-col">
          <DemoBanner />
          {!serverOk && (
            <div className="px-3 pt-2">
              <Callout tone="alert" title={isOnline ? "Changes may not save" : "You are offline"}>
                {isOnline ? "The centre's database is not answering." : "Check your phone's connection."}
              </Callout>
            </div>
          )}
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/login" element={<Login />} />
              <Route path="/l/:token" element={<LinkView />} />
              <Route path="/setup" element={<ProtectedRoute><SetupWizard /></ProtectedRoute>} />
              <Route path="/:username/schedule" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/staff" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/rooms" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/therapies" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/diet" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/timeoff" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/team" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/log" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/events" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/patients" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/:username/settings" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/dashboard/*" element={<Navigate to="/admin/schedule" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </div>
    </>
  );
};

export default App;
