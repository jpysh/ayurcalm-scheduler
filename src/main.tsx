import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { toast } from "sonner";
import "./index.css";
import { API_BASE } from "@/lib/apiBase";

// Attach the session token to every API call from one place, so the ~15 call
// sites across the app stay plain `fetch`. A 401 means the session is gone:
// clear it and bounce to the login screen.
if (typeof window !== "undefined") {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isApiCall = url.includes("/api/");
    const token = localStorage.getItem("authToken");
    if (isApiCall && token && !url.includes("/api/auth/login")) {
      init = { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } };
    }
    const res = await nativeFetch(input, init);
    // Patient and therapist share links have no account to sign in to, so
    // bouncing them to the login form helps nobody. See issue #16.
    const isShareLink = /^\/(patient|staff)\//.test(window.location.pathname);
    if (isApiCall && res.status === 401 && !isShareLink && window.location.pathname !== "/login") {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authRole");
      localStorage.removeItem("authUser");
      window.location.assign("/login");
    }
    return res;
  };
}

createRoot(document.getElementById("root")!).render(<App />);

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (window.location.pathname !== "/login") {
      location.reload();
    }
  });
  let failCount = 0;
  const extractMessage = (val: unknown): string => {
    if (typeof val === "string") return val;
    if (typeof val === "object" && val !== null) {
      const v = val as { message?: unknown; name?: unknown };
      const m = v.message ?? v.name ?? "";
      return String(m || "");
    }
    return "";
  };
  const isBenignAbort = (val: unknown) => {
    try {
      const s = extractMessage(val);
      return s.includes("AbortError") || s.includes("ERR_ABORTED") || s.includes("The operation was aborted");
    } catch {
      return false;
    }
  };
  const reportClientError = (payload: Record<string, unknown>) => {
    try {
      fetch(`${API_BASE}/client-errors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch (e) { void e; }
  };
  window.addEventListener("error", (e) => {
    const val = e.error || e.message || "";
    if (isBenignAbort(val)) return;
    const msg = extractMessage(val) || "Unexpected error";
    toast.error(String(msg).slice(0, 200));
    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
    reportClientError({
      message: String(msg),
      url: location.href,
      user_agent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      online: navigator.onLine,
      connection: nav.connection?.effectiveType,
      screen: { width: screen?.width, height: screen?.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      time: new Date().toISOString(),
      kind: "error",
    });
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const val = e.reason;
    if (isBenignAbort(val)) return;
    const msg = extractMessage(val) || "Unexpected error";
    toast.error(String(msg).slice(0, 200));
    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
    reportClientError({
      message: String(msg),
      url: location.href,
      user_agent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      online: navigator.onLine,
      connection: nav.connection?.effectiveType,
      screen: { width: screen?.width, height: screen?.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      time: new Date().toISOString(),
      kind: "unhandledrejection",
    });
  });
  const check = async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}/health`, { cache: "no-store", signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        failCount = 0;
      } else {
        failCount++;
      }
    } catch {
      failCount++;
    }
    if (failCount >= 3 && navigator.onLine) {
      if (window.location.pathname !== "/login") {
        location.reload();
      }
    }
  };
  setInterval(check, 150000);
}
