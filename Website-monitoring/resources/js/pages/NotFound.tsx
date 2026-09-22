import { Link } from "react-router-dom";
export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white">404</h1>
      <p className="text-gray-500 dark:text-gray-400 mt-2">Halaman tidak ditemukan</p>
      <Link to="/" className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Kembali ke Dashboard</Link>
    </div>
  );
}
