import type { CSSProperties } from 'react'

// Single fixed brand palette for the whole app: Turquoise.
// Flat single-tone navbar — primary, accent, border and ring are all the exact
// same #19A797 so the sidebar shows no shading whatsoever.
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

export const TURQUOISE_THEME: ThemePalette = {
  id: 'turquoise',
  name: 'Turquoise',
  primary: '#19A797',
  foreground: '#f0fdfa',
  ring: '#19A797',
  sidebarAccent: '#19A797',
  sidebarBorder: '#19A797',
  chart: ['#19A797', '#2dd4bf', '#5eead4', '#0d9488', '#14887A'],
}

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
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
] as const

function paletteToCssVars(palette: ThemePalette): CSSProperties {
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
    '--button-primary': palette.primary,
    '--button-primary-foreground': palette.foreground,
    '--button-primary-hover': palette.sidebarAccent,
    '--scrollbar-thumb': palette.primary,
    '--scrollbar-thumb-hover': palette.sidebarAccent,
  } as CSSProperties
}

// Turquoise theme overrides for light mode. Dark mode falls through to the
// platform defaults baked into globals.css.
export function getThemeVariables(isDarkTheme = false): CSSProperties | undefined {
  if (isDarkTheme) return undefined
  return paletteToCssVars(TURQUOISE_THEME)
}
