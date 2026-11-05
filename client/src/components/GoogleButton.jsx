import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

let scriptPromise;
function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google);
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.onload = () => resolve(window.google);
            script.onerror = () => {
                script.remove();
                scriptPromise = undefined;
                reject(new Error("Could not load Google sign-in. Check your connection and reload."));
            };
            document.head.appendChild(script);
        });
    }
    return scriptPromise;
}

export default function GoogleButton({ label, disabled, onBusyChange }) {
    const container = useRef(null);
    const active = useRef(false);
    const busy = useRef(false);
    const disabledRef = useRef(disabled);
    const busyCallback = useRef(onBusyChange);
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);
    const [credential, setCredential] = useState(null);
    const [password, setPassword] = useState("");
    const navigate = useNavigate();
    const setSession = useAuthStore((s) => s.setSession);
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    useEffect(() => { disabledRef.current = disabled; }, [disabled]);
    useEffect(() => { busyCallback.current = onBusyChange; }, [onBusyChange]);

    useEffect(() => {
        active.current = true;
        let cancelled = false;
        if (clientId) {
            loadGoogle().then((google) => {
                if (cancelled) return;
                google.accounts.id.initialize({
                    client_id: clientId,
                    callback: ({ credential: token }) => {
                        if (!disabledRef.current && !busy.current) void authenticate(token);
                    },
                    auto_select: false,
                });
                google.accounts.id.renderButton(container.current, {
                    type: "standard", theme: "outline", size: "large",
                    text: label?.startsWith("Sign up") ? "signup_with" : "continue_with",
                    width: Math.min(container.current.clientWidth || 320, 400),
                });
            }).catch((err) => { if (!cancelled) setError(err.message); });
        }
        return () => { cancelled = true; active.current = false; };

        async function authenticate(token, linkPassword) {
            if (busy.current) return;
            busy.current = true;
            setPending(true);
            busyCallback.current?.(true);
            setError("");
            try {
                const { data } = await api.post("/api/auth/google", {
                    credential: token, ...(linkPassword ? { password: linkPassword } : {}),
                });
                if (!active.current) return;
                setSession(data.token, data.user);
                navigate("/chat", { replace: true });
            } catch (err) {
                if (!active.current) return;
                if (err.response?.data?.code === "PASSWORD_REQUIRED") setCredential(token);
                setError(err.response?.data?.message || "Could not reach the server. Please try again.");
            } finally {
                busy.current = false;
                if (active.current) {
                    setPending(false);
                    busyCallback.current?.(false);
                }
            }
        }
    }, [clientId, label, navigate, setSession]);

    async function linkAccount(event) {
        event.preventDefault();
        if (busy.current || !password) return;
        busy.current = true;
        setPending(true);
        onBusyChange?.(true);
        setError("");
        try {
            const { data } = await api.post("/api/auth/google", { credential, password });
            if (!active.current) return;
            setSession(data.token, data.user);
            navigate("/chat", { replace: true });
        } catch (err) {
            if (active.current) setError(err.response?.data?.message || "Could not link your account. Please try again.");
        } finally {
            busy.current = false;
            if (active.current) { setPending(false); onBusyChange?.(false); }
        }
    }

    if (!clientId) return <p className="text-center text-sm text-muted">Google sign-in is not available yet.</p>;
    return (
        <div>
            <div ref={container} inert={disabled || pending || !!credential}
                className={`flex justify-center ${disabled || pending || credential ? "opacity-50" : ""}`} />
            {pending && <p role="status" className="mt-2 text-sm text-muted">Connecting to Google...</p>}
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
            {credential && (
                <form onSubmit={linkAccount} className="mt-3">
                    <label className="block text-sm">
                        Fern password
                        <input type="password" autoComplete="current-password" required
                            value={password} onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-line p-2" />
                    </label>
                    <button disabled={pending || !password} className="mt-2 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50">
                        Link account and sign in
                    </button>
                    <button type="button" disabled={pending} onClick={() => { setCredential(null); setPassword(""); setError(""); }}
                        className="ml-3 text-sm text-muted">Cancel</button>
                </form>
            )}
        </div>
    );
}
