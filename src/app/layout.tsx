import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, Great_Vibes, Poppins } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "800"],
});

const greatVibes = Great_Vibes({
  variable: "--font-great-vibes",
  subsets: ["latin"],
  weight: "400",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

// Some browser security/VPN extensions (notably ones that use the `bis_*`
// namespace) mutate server-rendered elements before React hydrates them. That
// makes otherwise identical server/client markup look different to React.
// Run this before hydration: remove attributes already injected in <head> and
// temporarily reject later `bis_*` writes while the initial document loads.
// No observer is used, so this cannot race React by removing tracked nodes.
const browserExtensionHydrationGuard = `
(() => {
  const isBisAttribute = (name) => typeof name === 'string' && /^bis_/i.test(name);
  const originalSetAttribute = Element.prototype.setAttribute;
  const originalSetAttributeNS = Element.prototype.setAttributeNS;

  const removeInjectedAttributes = (root) => {
    if (!root) return;
    const elements = [root, ...root.querySelectorAll('*')];
    for (const element of elements) {
      if (!element.attributes) continue;
      for (const attribute of Array.from(element.attributes)) {
        if (isBisAttribute(attribute.name)) element.removeAttribute(attribute.name);
      }
    }
  };

  removeInjectedAttributes(document.documentElement);

  Element.prototype.setAttribute = function(name, value) {
    if (isBisAttribute(name)) return;
    return originalSetAttribute.call(this, name, value);
  };

  Element.prototype.setAttributeNS = function(namespace, name, value) {
    if (isBisAttribute(name)) return;
    return originalSetAttributeNS.call(this, namespace, name, value);
  };

  window.addEventListener('load', () => {
    removeInjectedAttributes(document.documentElement);
    Element.prototype.setAttribute = originalSetAttribute;
    Element.prototype.setAttributeNS = originalSetAttributeNS;
  }, { once: true });
})();
`;

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
  const defaultIcon = '/logo.png';
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

  const syncExistingIcons = (source) => {
    const href = source.includes('?') ? source + '&v=' + Date.now() : source + '?v=' + Date.now();
    document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach((icon) => {
      const type = mimeType(source);
      if (type) icon.type = type;
      else icon.removeAttribute('type');
      icon.sizes = 'any';
      icon.setAttribute('data-school-icon-source', source);
      icon.href = href;
    });
  };

  try {
    const school = readJson(brandingKey) || readJson('erp_currentSchool');
    if (!school?.name) return;
    document.title = school.name + ' Dashboard';
    const iconSource = school.favicon || school.logo || defaultIcon;
    syncExistingIcons(iconSource);
    upsertIcon('icon', iconSource);
    upsertIcon('shortcut icon', iconSource);
    upsertIcon('apple-touch-icon', iconSource);
  } catch {}
})();
`;

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.PUBLIC_APP_URL && !process.env.PUBLIC_APP_URL.includes('ngrok') ? process.env.PUBLIC_APP_URL : 'https://vidhyalayam.com')).replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Vidhyalayam - Best School Management System & ERP Software",
    template: "%s | Vidhyalayam",
  },
  description:
    "Vidhyalayam is the next-generation School Management System & ERP software. Streamline student admissions, biometric attendance, 1-click fee collection with UPI & WhatsApp receipts, automated CBSE/ICSE report cards, and GPS bus tracking.",
  keywords: [
    "School Management System",
    "School ERP Software",
    "Best School Management Software in India",
    "Student Attendance Management System",
    "School Fee Management Software",
    "Automated Report Card Generator",
    "School Bus GPS Tracking",
    "Parent Teacher Communication App",
    "Vidhyalayam",
    "Digital School Management",
    "Education ERP",
  ],
  authors: [{ name: "Vidhyalayam Technologies", url: siteUrl }],
  creator: "Vidhyalayam Technologies",
  publisher: "Vidhyalayam Technologies",
  category: "Education Technology",
  applicationName: "Vidhyalayam School ERP",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Vidhyalayam - Smart School Management System & ERP Software",
    description:
      "Transform your school into a digital powerhouse. All-in-one platform for admissions, biometric attendance, fee receipts, exams, and parent communications.",
    url: siteUrl,
    siteName: "Vidhyalayam",
    locale: "en_IN",
    type: "website",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Vidhyalayam Logo - School Management System",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vidhyalayam - Smart School Management System & ERP Software",
    description:
      "All-in-one school management platform for admissions, biometric attendance, online fees, and digital report cards.",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/logo.png", sizes: "32x32" },
      { url: "/logo.png", sizes: "192x192" },
    ],
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      "name": "Vidhyalayam",
      "operatingSystem": "Web, Android, iOS",
      "applicationCategory": "EducationalApplication",
      "url": siteUrl,
      "description":
        "Comprehensive school management ERP system for attendance, fee collection, examinations, and communication.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "INR",
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "128",
      },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      "name": "Vidhyalayam",
      "url": siteUrl,
      "logo": `${siteUrl}/logo.png`,
      "sameAs": [
        "https://www.linkedin.com/company/vidhyalayam",
        "https://twitter.com/vidhyalayam",
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+91-9876543210",
        "contactType": "customer service",
        "areaServed": "IN",
        "availableLanguage": ["English", "Hindi"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      "url": siteUrl,
      "name": "Vidhyalayam",
      "publisher": {
        "@id": `${siteUrl}/#organization`,
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" && (
          <script dangerouslySetInnerHTML={{ __html: browserExtensionHydrationGuard }} />
        )}
        <script dangerouslySetInnerHTML={{ __html: schoolBrandingScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${greatVibes.variable} ${poppins.variable} antialiased bg-brand-page text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
