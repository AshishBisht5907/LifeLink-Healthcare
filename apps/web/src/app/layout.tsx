import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export const metadata: Metadata = {
  title: "LifeLink — Connected Care. Better Tomorrow.",
  description: "Emergency health & hospital care coordination platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
          <ThemeToggle />
        </ToastProvider>
      </body>
    </html>
  );
}
