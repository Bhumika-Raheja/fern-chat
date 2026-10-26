import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import GoogleButton from "../components/GoogleButton";

const emailOk = (v) => /^\S+@\S+\.\S+$/.test(v);

// 0-3 points: length, mixed characters, and a long password with a symbol
function strength(pw) {
    if (!pw) return 0;
    let points = 0;
    if (pw.length >= 8) points++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) points++;
    if (pw.length >= 12 && /[^A-Za-z0-9]/.test(pw)) points++;
    return Math.max(points, 1);
}

const levels = [
    null,
    { label: "Weak", bar: "bg-danger", text: "text-danger" },
    { label: "Medium", bar: "bg-accent", text: "text-accent" },
    { label: "Strong", bar: "bg-online", text: "text-online" },
];

export default function Signup() {
    const navigate = useNavigate();
    const token = useAuthStore((s) => s.token);
    const setSession = useAuthStore((s) => s.setSession);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [agree, setAgree] = useState(false);
    const [errors, setErrors] = useState({});
    const [alert, setAlert] = useState("");
    const [loading, setLoading] = useState(false);
    const [waking, setWaking] = useState(false);

    if (token) return <Navigate to="/chat" replace />;

    const level = levels[strength(password)];

    async function handleSubmit(e) {
        e.preventDefault();
        setAlert("");

        const next = {};
        if (!name.trim()) next.name = "Enter your name";
        if (!emailOk(email)) next.email = "Enter a valid email address";
        if (password.length < 8) next.password = "Use at least 8 characters";
        if (confirm !== password) next.confirm = "Passwords do not match";
        if (!agree) next.agree = "Please accept the terms to continue";
        setErrors(next);
        if (Object.keys(next).length) return;

        setLoading(true);
        const timer = setTimeout(() => setWaking(true), 4000);

        try {
            const res = await api.post("/api/auth/signup", { name, email, password });
            setSession(res.data.token, res.data.user);
            navigate("/chat");
        } catch (err) {
            if (err.response?.status === 409) {
                setErrors({ email: "This email is already registered" });
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

            <h1 className="text-2xl font-semibold">Create your account</h1>
            <p className="mb-5 text-sm text-muted">Join your team on Fern today</p>

            <GoogleButton
                label="Sign up with Google"
                disabled={loading}
                onClick={() => setAlert("Google sign-up is coming soon.")}
            />

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={handleSubmit} noValidate>
                <AuthField
                    label="Full name"
                    value={name}
                    onChange={setName}
                    error={errors.name}
                    placeholder="e.g. Maya Lin"
                    autoComplete="name"
                />
                <AuthField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    error={errors.email}
                    placeholder="you@example.com"
                    autoComplete="email"
                />
                <AuthField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    error={errors.password}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                />

                {/* Strength meter: three segments that fill in */}
                {password && (
                    <div className="-mt-2 mb-4">
                        <div className="flex gap-1.5">
                            {[1, 2, 3].map((n) => (
                                <span
                                    key={n}
                                    className={`h-1.5 flex-1 rounded-full ${n <= strength(password) ? level.bar : "bg-line"
                                        }`}
                                />
                            ))}
                        </div>
                        <p className={`mt-1 text-xs ${level.text}`}>Strength: {level.label}</p>
                    </div>
                )}

                <AuthField
                    label="Confirm password"
                    type="password"
                    value={confirm}
                    onChange={setConfirm}
                    error={errors.confirm}
                    placeholder="Type it again"
                    autoComplete="new-password"
                />

                <label className="mb-1 flex items-start gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={agree}
                        onChange={(e) => setAgree(e.target.checked)}
                        className="mt-0.5 accent-[#5e6f45]"
                    />
                    <span>I agree to the Terms of Service and Privacy Policy</span>
                </label>
                {errors.agree && <p className="mb-2 text-xs text-danger">{errors.agree}</p>}

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                    {loading && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    )}
                    {loading ? "Creating account..." : "Create account"}
                </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted">
                Already have an account?{" "}
                <Link to="/login" className="font-medium text-primary">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
}