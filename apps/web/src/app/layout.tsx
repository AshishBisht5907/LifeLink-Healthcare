import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";

// Deliberately NOT using next/font/google here — this sandboxed build
// environment has no network access to fonts.googleapis.com. A clean
// system-font stack (defined in globals.css) gives an equally modern look
// without a build-time external dependency.

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
        </ToastProvider>
      </body>
    </html>
  );
}
