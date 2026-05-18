import type { CSSProperties } from 'react'

export interface ThemePalette {
  id: string
  name: string
  primary: string
  foreground: string
  ring: string
  sidebarAccent: string
  sidebarBorder: string
  chart: [string, string, string, string, string]
}

export interface DashboardFontOption {
  id: string
  name: string
  description: string
  stack: string
}

export const DASHBOARD_FONT_OPTIONS: DashboardFontOption[] = [
  {
    id: 'system',
    name: 'System',
    description: 'Clean default interface font',
    stack: 'var(--font-geist-sans), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: 'segoe',
    name: 'Segoe UI',
    description: 'Soft and familiar dashboard style',
    stack: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    id: 'arial',
    name: 'Arial',
    description: 'Compact and highly readable',
    stack: 'Arial, Helvetica, sans-serif',
  },
  {
    id: 'verdana',
    name: 'Verdana',
    description: 'Wide spacing for dense screens',
    stack: 'Verdana, Geneva, sans-serif',
  },
  {
    id: 'trebuchet',
    name: 'Trebuchet',
    description: 'Friendly school dashboard feel',
    stack: '"Trebuchet MS", "Segoe UI", sans-serif',
  },
  {
    id: 'georgia',
    name: 'Georgia',
    description: 'Formal serif style',
    stack: 'Georgia, "Times New Roman", serif',
  },
]

export const DEFAULT_DASHBOARD_FONT = DASHBOARD_FONT_OPTIONS[0]

export const SCHOOL_THEME_PALETTES: ThemePalette[] = [
  {
    id: 'white',
    name: 'White',
    primary: '#ffffff',
    foreground: '#0f172a',
    ring: '#94a3b8',
    sidebarAccent: '#f1f5f9',
    sidebarBorder: '#e2e8f0',
    chart: ['#0f172a', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'],
  },
  {
    id: 'emerald',
    name: 'Emerald',
    primary: '#10b981',
    foreground: '#f0fdf4',
    ring: '#059669',
    sidebarAccent: '#059669',
    sidebarBorder: '#047857',
    chart: ['#10b981', '#14b8a6', '#34d399', '#2dd4bf', '#059669'],
  },
  {
    id: 'teal',
    name: 'Teal',
    primary: '#0d9488',
    foreground: '#f0fdfa',
    ring: '#0f766e',
    sidebarAccent: '#0f766e',
    sidebarBorder: '#115e59',
    chart: ['#0d9488', '#06b6d4', '#2dd4bf', '#22d3ee', '#0f766e'],
  },
  {
    id: 'blue',
    name: 'Blue',
    primary: '#2563eb',
    foreground: '#eff6ff',
    ring: '#1d4ed8',
    sidebarAccent: '#1d4ed8',
    sidebarBorder: '#1e40af',
    chart: ['#2563eb', '#38bdf8', '#60a5fa', '#0ea5e9', '#1d4ed8'],
  },
  {
    id: 'sky',
    name: 'Sky',
    primary: '#0284c7',
    foreground: '#f0f9ff',
    ring: '#0369a1',
    sidebarAccent: '#0369a1',
    sidebarBorder: '#075985',
    chart: ['#0284c7', '#06b6d4', '#38bdf8', '#67e8f9', '#0369a1'],
  },
  {
    id: 'indigo',
    name: 'Indigo',
    primary: '#4f46e5',
    foreground: '#eef2ff',
    ring: '#4338ca',
    sidebarAccent: '#4338ca',
    sidebarBorder: '#3730a3',
    chart: ['#4f46e5', '#8b5cf6', '#818cf8', '#a78bfa', '#4338ca'],
  },
  {
    id: 'violet',
    name: 'Violet',
    primary: '#7c3aed',
    foreground: '#f5f3ff',
    ring: '#6d28d9',
    sidebarAccent: '#6d28d9',
    sidebarBorder: '#5b21b6',
    chart: ['#7c3aed', '#a855f7', '#8b5cf6', '#c084fc', '#6d28d9'],
  },
  {
    id: 'purple',
    name: 'Purple',
    primary: '#9333ea',
    foreground: '#faf5ff',
    ring: '#7e22ce',
    sidebarAccent: '#7e22ce',
    sidebarBorder: '#6b21a8',
    chart: ['#9333ea', '#d946ef', '#a855f7', '#e879f9', '#7e22ce'],
  },
  {
    id: 'rose',
    name: 'Rose',
    primary: '#e11d48',
    foreground: '#fff1f2',
    ring: '#be123c',
    sidebarAccent: '#be123c',
    sidebarBorder: '#9f1239',
    chart: ['#e11d48', '#f97316', '#fb7185', '#fb923c', '#be123c'],
  },
  {
    id: 'pink',
    name: 'Pink',
    primary: '#db2777',
    foreground: '#fdf2f8',
    ring: '#be185d',
    sidebarAccent: '#be185d',
    sidebarBorder: '#9d174d',
    chart: ['#db2777', '#f43f5e', '#ec4899', '#fb7185', '#be185d'],
  },
  {
    id: 'amber',
    name: 'Amber',
    primary: '#d97706',
    foreground: '#fffbeb',
    ring: '#b45309',
    sidebarAccent: '#b45309',
    sidebarBorder: '#92400e',
    chart: ['#d97706', '#f59e0b', '#fbbf24', '#f97316', '#b45309'],
  },
  {
    id: 'orange',
    name: 'Orange',
    primary: '#ea580c',
    foreground: '#fff7ed',
    ring: '#c2410c',
    sidebarAccent: '#c2410c',
    sidebarBorder: '#9a3412',
    chart: ['#ea580c', '#f59e0b', '#fb923c', '#fbbf24', '#c2410c'],
  },
  {
    id: 'lime',
    name: 'Lime',
    primary: '#65a30d',
    foreground: '#f7fee7',
    ring: '#4d7c0f',
    sidebarAccent: '#4d7c0f',
    sidebarBorder: '#3f6212',
    chart: ['#65a30d', '#84cc16', '#a3e635', '#22c55e', '#4d7c0f'],
  },
  {
    id: 'cyan',
    name: 'Cyan',
    primary: '#0891b2',
    foreground: '#ecfeff',
    ring: '#0e7490',
    sidebarAccent: '#0e7490',
    sidebarBorder: '#155e75',
    chart: ['#0891b2', '#14b8a6', '#22d3ee', '#2dd4bf', '#0e7490'],
  },
  {
    id: 'slate',
    name: 'Slate',
    primary: '#475569',
    foreground: '#f8fafc',
    ring: '#334155',
    sidebarAccent: '#334155',
    sidebarBorder: '#1e293b',
    chart: ['#475569', '#64748b', '#94a3b8', '#0f766e', '#334155'],
  },
]

export const DEFAULT_SCHOOL_THEME = SCHOOL_THEME_PALETTES[0]

export const SCHOOL_THEME_VARIABLE_NAMES = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--button-primary',
  '--button-primary-foreground',
  '--button-primary-hover',
] as const

export function findSchoolThemePalette(primaryColor?: string | null) {
  if (!primaryColor) return DEFAULT_SCHOOL_THEME
  const normalized = primaryColor.toLowerCase()
  return SCHOOL_THEME_PALETTES.find((palette) => palette.primary.toLowerCase() === normalized) || {
    ...DEFAULT_SCHOOL_THEME,
    id: 'custom',
    name: 'Custom',
    primary: primaryColor,
    ring: primaryColor,
    sidebarAccent: primaryColor,
    sidebarBorder: primaryColor,
    chart: [primaryColor, DEFAULT_SCHOOL_THEME.chart[1], DEFAULT_SCHOOL_THEME.chart[2], DEFAULT_SCHOOL_THEME.chart[3], primaryColor],
  }
}

export function getSchoolThemeVariables(primaryColor?: string | null, isDarkTheme = false): CSSProperties | undefined {
  if (isDarkTheme) return undefined

  const palette = findSchoolThemePalette(primaryColor)
  const isWhitePalette = palette.primary.toLowerCase() === '#ffffff'
  const buttonPrimary = isWhitePalette ? '#0f172a' : palette.primary
  const buttonPrimaryForeground = isWhitePalette ? '#ffffff' : palette.foreground
  const buttonPrimaryHover = isWhitePalette ? '#1e293b' : palette.sidebarAccent

  return {
    '--primary': palette.primary,
    '--primary-foreground': palette.foreground,
    '--ring': palette.ring,
    '--sidebar': palette.primary,
    '--sidebar-foreground': palette.foreground,
    '--sidebar-primary': palette.foreground,
    '--sidebar-primary-foreground': palette.primary,
    '--sidebar-accent': palette.sidebarAccent,
    '--sidebar-accent-foreground': palette.foreground,
    '--sidebar-border': palette.sidebarBorder,
    '--sidebar-ring': palette.ring,
    '--chart-1': palette.chart[0],
    '--chart-2': palette.chart[1],
    '--chart-3': palette.chart[2],
    '--chart-4': palette.chart[3],
    '--chart-5': palette.chart[4],
    '--button-primary': buttonPrimary,
    '--button-primary-foreground': buttonPrimaryForeground,
    '--button-primary-hover': buttonPrimaryHover,
  } as CSSProperties
}

export function findDashboardFont(fontId?: string | null) {
  if (!fontId) return DEFAULT_DASHBOARD_FONT
  return DASHBOARD_FONT_OPTIONS.find((font) => font.id === fontId) || DEFAULT_DASHBOARD_FONT
}
