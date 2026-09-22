import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Droplets } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

export function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Object && "message" in err ? (err as { message: string }).message : "Login gagal";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f9ff] dark:bg-[#0b1220] p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-lg border dark:border-gray-800 overflow-hidden">
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white mx-auto mb-3">
            <Droplets className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">AquaMonitor</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Water Monitoring System</p>
        </div>

        <form onSubmit={onSubmit} className="px-8 pb-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <Input type="email" placeholder="admin@watermonitoring.test" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <Input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1" />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Memproses..." : "Masuk"}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <input type="checkbox" className="rounded" /> Remember me
            </label>
            <span className="text-gray-400">Forgot password?</span>
          </div>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Belum punya akun?{" "}
            <Link to="/signup" className="text-blue-600 hover:underline dark:text-blue-400">
              Daftar
            </Link>
          </p>

          <div className="text-center text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg py-2">
            Demo: gunakan admin@watermonitoring.test / password
          </div>
        </form>
      </div>
    </div>
  );
}
