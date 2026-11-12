import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dear Diary",
  description:
    "A private text, audio, and video journal locked with a passcode. Everything stays encrypted on your device.",
  icons: {
    icon: "/diary_icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e7eef1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1d25" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}
      // The boot script may add data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-body text-ink">
        {children}
      </body>
    </html>
  );
}
