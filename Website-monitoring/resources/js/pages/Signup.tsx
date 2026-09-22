import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Droplets } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

export function Signup() {
  const { register, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Password dan konfirmasi tidak cocok");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await register(name, email, password, confirm);
      navigate("/");
    } catch (err: unknown) {
      const anyErr = err as { message?: string; errors?: Record<string, string[]> };
      if (anyErr.errors) {
        const first = Object.values(anyErr.errors)[0]?.[0];
        setError(first || anyErr.message || "Registrasi gagal");
      } else {
        setError(anyErr.message || "Registrasi gagal");
      }
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
          <p className="text-sm text-gray-500 dark:text-gray-400">Buat akun baru</p>
        </div>

        <form onSubmit={onSubmit} className="px-8 pb-8 space-y-4">
          <div>
            <label className="text-sm font-medium">Full Name</label>
            <Input placeholder="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <Input type="password" placeholder="Min 6 karakter" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Confirm Password</label>
            <Input type="password" placeholder="Ulangi password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="mt-1" />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Memproses..." : "Daftar"}
          </Button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Sudah punya akun? <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">Masuk</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
