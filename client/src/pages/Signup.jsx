import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import FernLogo from "../components/FernLogo";

export default function Signup() {
    const navigate = useNavigate();
    const setSession = useAuthStore((s) => s.setSession);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            const res = await api.post("/api/auth/signup", { name, email, password });
            setSession(res.data.token, res.data.user);
            navigate("/chat");
        } catch (err) {
            setError(err.response?.data?.message || "Could not reach the server");
        } finally {
            setLoading(false);
        }
    }

    const inputClass =
        "mb-4 w-full rounded-lg border border-line bg-cream px-3 py-2 outline-none focus:border-primary";

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm"
            >
                <div className="flex items-center gap-2 mb-6">
                    <FernLogo size={32} />
                    <span className="text-xl font-semibold">Fern</span>
                </div>

                <h1 className="text-2xl font-semibold">Create your account</h1>
                <p className="mb-6 text-sm text-muted">Join your team on Fern today</p>

                {error && (
                    <div className="mb-4 rounded-lg border border-danger bg-red-50 px-3 py-2 text-sm text-danger">
                        {error}
                    </div>
                )}

                <label className="mb-1 block text-sm font-medium">Full name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={inputClass}
                />

                <label className="mb-1 block text-sm font-medium">Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClass}
                />

                <label className="mb-1 block text-sm font-medium">Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={inputClass}
                />

                <label className="mb-1 block text-sm font-medium">Confirm password</label>
                <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="mb-6 w-full rounded-lg border border-line bg-cream px-3 py-2 outline-none focus:border-primary"
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-primary py-2 font-medium text-white disabled:opacity-60"
                >
                    {loading ? "Creating account..." : "Create account"}
                </button>

                <p className="mt-4 text-center text-sm text-muted">
                    Already have an account?{" "}
                    <Link to="/login" className="font-medium text-primary">
                        Sign in
                    </Link>
                </p>
            </form>
        </div>
    );
}