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

const schoolBrandingScript = `
(() => {
  const defaultTitle = 'My Digital Academy - School Management System';
  const defaultIcon = '/icon.svg';
  const brandingKey = 'erp_schoolBranding';
  let activeBranding = null;
  let applying = false;
  let managedIconUrl = null;

  const readJson = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || 'null'); } catch { return null; }
  };

  const cache = (school) => {
    if (!school?.name) return;
    const branding = {
      name: school.name,
      favicon: school.favicon || undefined,
      logo: school.logo || undefined,
    };
    try { localStorage.setItem(brandingKey, JSON.stringify(branding)); }
    catch {
      try { sessionStorage.setItem(brandingKey, JSON.stringify(branding)); } catch {}
    }
  };

  const mimeType = (source) => {
    const match = source?.match?.(/^data:(image\\/[^;,]+)[;,]/);
    return match?.[1] || '';
  };

  const freshIconHref = (source) => {
    if (managedIconUrl) {
      try { URL.revokeObjectURL(managedIconUrl); } catch {}
      managedIconUrl = null;
    }

    if (!source?.startsWith?.('data:image/')) {
      return source.includes('?') ? source + '&v=' + Date.now() : source + '?v=' + Date.now();
    }

    try {
      const parts = source.split(',');
      const meta = parts.shift() || '';
      const data = parts.join(',');
      const binary = meta.includes(';base64') ? atob(data) : decodeURIComponent(data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      managedIconUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType(source) || 'image/png' }));
      return managedIconUrl;
    } catch {
      return source;
    }
  };

  const upsertIcon = (rel, source, href) => {
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
    icon.href = href;
  };

  const apply = (school) => {
    if (!school?.name || applying) return;
    applying = true;
    activeBranding = {
      name: school.name,
      favicon: school.favicon || undefined,
      logo: school.logo || undefined,
    };
    document.title = school?.name ? school.name + ' Dashboard' : defaultTitle;
    document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach((icon) => {
      if (icon.getAttribute('data-school-branding') !== 'favicon') icon.remove();
    });
    const iconSource = school?.favicon || school?.logo || defaultIcon;
    const iconHref = freshIconHref(iconSource);
    upsertIcon('icon', iconSource, iconHref);
    upsertIcon('shortcut icon', iconSource, iconHref);
    cache(activeBranding);
    applying = false;
  };

  const enforce = () => {
    if (!activeBranding?.name) return;
    const targetTitle = activeBranding.name + ' Dashboard';
    const targetIcon = activeBranding.favicon || activeBranding.logo || defaultIcon;
    const managedIcon = document.querySelector("link[data-school-branding='favicon'][rel='icon']");
    const managedShortcutIcon = document.querySelector("link[data-school-branding='favicon'][rel='shortcut icon']");
    const defaultIcons = Array.from(document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"))
      .some((icon) => icon.getAttribute('data-school-branding') !== 'favicon');

    if (
      document.title !== targetTitle ||
      !managedIcon ||
      !managedShortcutIcon ||
      managedIcon.getAttribute('data-school-icon-source') !== targetIcon ||
      managedShortcutIcon.getAttribute('data-school-icon-source') !== targetIcon ||
      defaultIcons
    ) {
      apply(activeBranding);
    }
  };

  try {
    new MutationObserver(enforce).observe(document.head, { childList: true, subtree: true, characterData: true });

    const cachedBranding = readJson(brandingKey);
    const school = cachedBranding || readJson('erp_currentSchool');
    if (school) {
      apply(school);
      [0, 25, 100, 300, 1000, 2500].forEach((delay) => setTimeout(enforce, delay));
    }

    const token = localStorage.getItem('erp_token');
    const user = readJson('erp_user');
    if (!token || user?.role === 'SUPER_ADMIN') return;

    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((res) => res.ok ? res.json() : null)
      .then((profile) => {
        if (!profile?.school) return;
        apply(profile.school);
        [0, 25, 100, 300, 1000, 2500].forEach((delay) => setTimeout(enforce, delay));
        enforce();
        try { localStorage.setItem('erp_currentSchool', JSON.stringify(profile.school)); } catch {}
      })
      .catch(() => {});
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: "My Digital Academy - School Management System",
  description: "School Management System for digital academy management. Complete solution for student management, fees, attendance, and more.",
  keywords: ["School Management", "Digital Academy", "Education Management", "Student Management", "Fees Management", "Attendance"],
  authors: [{ name: "My Digital Academy" }],
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
