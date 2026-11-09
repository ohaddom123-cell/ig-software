import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ig-software — content planner",
  description: "AI content work-plan generator with approval-gated posting reminders",
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/brief", label: "Weekly Brief" },
  { href: "/calendar", label: "Calendar" },
  { href: "/approve", label: "Approve" },
  { href: "/historical-validation", label: "Historical Validation" },
  { href: "/time-tracking", label: "Time Tracking" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3">
              <span className="mr-4 text-sm font-bold text-slate-900">ig-software</span>
              <nav className="flex flex-wrap gap-1 text-sm">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
