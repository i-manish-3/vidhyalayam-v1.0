import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// One-shot pre-hydration branding: set <title> and favicon from cached
// localStorage BEFORE React mounts so a hard refresh doesn't flash the default
// title/icon. After hydration, BrandHeadManager (React) owns all updates.
//
// IMPORTANT: do NOT install a MutationObserver here, do NOT schedule setTimeout
// enforcement loops, and do NOT mutate <head> after React boots. Those caused
// "Cannot read properties of null (reading 'removeChild')" crashes in React's
// reconciler because the script was removing <link> nodes that React was still
// tracking in its Fiber tree.
const schoolBrandingScript = `
(() => {
  const defaultTitle = 'Vidhyalayam - School Management System';
  const defaultIcon = '/icon.svg';
  const brandingKey = 'erp_schoolBranding';

  const readJson = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || 'null'); } catch { return null; }
  };

  const mimeType = (source) => {
    const match = source?.match?.(/^data:(image\\/[^;,]+)[;,]/);
    return match?.[1] || '';
  };

  const upsertIcon = (rel, source) => {
    let icon = document.querySelector("link[data-school-branding='favicon'][rel='" + rel + "']");
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = rel;
      icon.setAttribute('data-school-branding', 'favicon');
      document.head.appendChild(icon);
    }
    const type = mimeType(source);
    if (type) icon.type = type;
    else icon.removeAttribute('type');
    icon.sizes = 'any';
    icon.setAttribute('data-school-icon-source', source);
    icon.href = source.includes('?') ? source + '&v=' + Date.now() : source + '?v=' + Date.now();
  };

  try {
    const school = readJson(brandingKey) || readJson('erp_currentSchool');
    if (!school?.name) return;
    document.title = school.name + ' Dashboard';
    const iconSource = school.favicon || school.logo || defaultIcon;
    upsertIcon('icon', iconSource);
    upsertIcon('shortcut icon', iconSource);
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: "Vidhyalayam - School Management System",
  description: "School Management System for Vidhyalayam. Complete solution for student management, fees, attendance, and more.",
  keywords: ["School Management", "Vidhyalayam", "Education Management", "Student Management", "Fees Management", "Attendance"],
  authors: [{ name: "Vidhyalayam" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: schoolBrandingScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
