import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import GoogleButton from "../components/GoogleButton";

const emailOk = (v) => /^\S+@\S+\.\S+$/.test(v);

export default function Login() {
    const navigate = useNavigate();
    const token = useAuthStore((s) => s.token);
    const setSession = useAuthStore((s) => s.setSession);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [alert, setAlert] = useState("");
    const [loading, setLoading] = useState(false);
    const [waking, setWaking] = useState(false);

    // Already logged in? Go straight to the chat
    if (token) return <Navigate to="/chat" replace />;

    async function handleSubmit(e) {
        e.preventDefault();
        setAlert("");

        const next = {};
        if (!emailOk(email)) next.email = "Enter a valid email address";
        if (!password) next.password = "Enter your password";
        setErrors(next);
        if (Object.keys(next).length) return;

        setLoading(true);
        // If the free server is asleep, this takes a while: tell the user why
        const timer = setTimeout(() => setWaking(true), 4000);

        try {
            const res = await api.post("/api/auth/login", { email, password });
            setSession(res.data.token, res.data.user);
            navigate("/chat");
        } catch (err) {
            if (err.response?.status === 401) {
                setAlert("Unable to sign in. Please check your credentials and try again.");
                setErrors({ password: "Incorrect email or password" });
            } else {
                setAlert(err.response?.data?.message || "Could not reach the server. Please try again.");
            }
        } finally {
            clearTimeout(timer);
            setWaking(false);
            setLoading(false);
        }
    }

    return (
        <AuthLayout>
            {waking && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm">
                    <span className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    Waking up the server, this can take up to 30 seconds on the first visit.
                </div>
            )}
            {alert && !waking && (
                <div className="mb-4 rounded-lg border border-danger bg-red-50 px-3 py-2 text-sm text-danger">
                    {alert}
                </div>
            )}

            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="mb-6 text-sm text-muted">Sign in to continue to Fern</p>

            <form onSubmit={handleSubmit} noValidate>
                <AuthField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    error={errors.email}
                    placeholder="you@university.edu"
                    autoComplete="email"
                />
                <AuthField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    error={errors.password}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                    {loading && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    )}
                    {loading ? "Signing in..." : "Sign in"}
                </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
            </div>

            <GoogleButton
                label="Continue with Google"
                disabled={loading}
                onClick={() => setAlert("Google sign-in is coming soon.")}
            />

            <p className="mt-6 text-center text-sm text-muted">
                New to Fern?{" "}
                <Link to="/signup" className="font-medium text-primary">
                    Create an account
                </Link>
            </p>
        </AuthLayout>
    );
}