import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INTERVIEW DRILL",
  description: "Active recall and practical interview training across configured modules.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
