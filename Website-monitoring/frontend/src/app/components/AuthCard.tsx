import { ReactNode } from 'react';

interface AuthCardProps {
  heading: string;
  children: ReactNode;
}

export function AuthCard({ heading, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] px-4 py-8 sm:py-12">
      <div className="overflow-hidden rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] bg-white w-full max-w-md">
        <div className="bg-[#3498DB] px-6 py-8 sm:px-8 sm:py-10 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">AquaMonitor</h1>
          <p className="mt-1 text-sm text-white/80">Water Monitoring System</p>
        </div>
        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <h2 className="mb-6 text-xl sm:text-2xl font-semibold text-gray-900">{heading}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}