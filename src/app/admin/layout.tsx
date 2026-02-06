import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Kevin Lee Photography",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0] font-admin">
      {children}
    </div>
  );
}
