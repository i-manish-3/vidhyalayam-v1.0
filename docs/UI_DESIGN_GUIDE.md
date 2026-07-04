# Vidhyalayam UI Design Guide

Use this document as the visual source of truth for all new pages and UI updates in this project. It can be shared directly with a developer or an AI coding assistant.

## Copy-paste handoff instruction

> Build the requested page using the existing Vidhyalayam design system. Follow `docs/UI_DESIGN_GUIDE.md` exactly. Reuse the shared shadcn components and CSS variables; do not introduce a second design language. Keep the interface compact, colorful, responsive, permission-aware, and fully usable in light and dark mode. Preserve existing business logic and change only the UI unless functionality is explicitly requested.

## 1. Design character

The product should feel:

- Modern, friendly, colorful, and suitable for a school management dashboard.
- Compact and information-dense without feeling crowded.
- Consistent: the same visual grammar should appear on Dashboard, Students, Fees, Timetable, Admissions, Houses, Alumni, and future modules.
- Professional rather than decorative. Color should communicate grouping, status, and hierarchy.

Avoid oversized cards, excessive empty space, heavy shadows, random gradients, or different styling on every page.

## 2. Technology and reusable primitives

- Next.js 16 and React 19.
- Tailwind CSS v4 utilities.
- Existing shadcn/Radix components from `src/components/ui`.
- Lucide icons from `lucide-react`.
- Use `cn()` from `@/lib/utils` for conditional classes.
- Use CSS theme variables instead of duplicating the brand color throughout components.

Do not install another UI or icon library for ordinary interface work.

## 3. Core color system

### Brand colors

| Purpose | Value |
|---|---|
| Primary turquoise | `#156974` |
| Primary foreground | `#f0fdfa` |
| Header middle teal | `#0d9488` |
| Header end sky | `#0284c7` |
| Sidebar middle teal | `#11847f` |
| Sidebar end blue | `#087fa4` |

Always prefer semantic utilities such as `bg-primary`, `text-primary`, `border-primary/20`, and `text-primary-foreground` over hardcoded brand values.

### Shared gradients

These tokens are defined in `src/app/globals.css`:

```css
--gradient-header: linear-gradient(90deg, var(--primary) 0%, #0d9488 50%, #0284c7 100%);
--gradient-sidebar: linear-gradient(170deg, var(--primary) 0%, #11847f 68%, #087fa4 100%);
--page-background: color-mix(in oklab, var(--background) 94%, var(--primary) 6%);
```

Use the existing utility classes:

- `bg-brand-header` for the top navigation.
- `bg-brand-sidebar` for the left navigation.
- `bg-brand-page` for the application page surface.

### Supporting colors

Supporting colors identify modules and data categories. Use pale surfaces with a stronger icon/accent:

| Meaning/module | Color family |
|---|---|
| Students | Sky |
| Teachers / timetable | Violet or sky |
| Collected / success / fees paid | Emerald |
| Pending / warning | Amber or orange |
| Attendance | Rose |
| Admission | Cyan |
| Reports | Indigo |
| Inventory | Orange |

Supporting colors must not replace the global turquoise brand color.

## 4. Layout and spacing

- Standard page wrapper: `space-y-4` or `space-y-6`.
- Main page padding is controlled by the app shell; do not add large nested page padding.
- Use `gap-2` to `gap-4` for compact control and card grids.
- Typical card radius: `rounded-xl`.
- Typical control radius: `rounded-lg` or the existing shadcn default.
- Desktop controls should normally be `h-8`, `h-9`, or `h-10`.
- Avoid fixed heights unless the content genuinely needs them.
- Every row must wrap or stack cleanly on small screens.

The main document owns vertical scrolling. Do not create small nested scrollbars in menus or header strips unless the content cannot fit otherwise. Horizontal quick navigation may use `overflow-x-auto` with `no-scrollbar`.

## 5. Branded page hero

Major pages should start with a compact branded hero. It contains:

- A relevant Lucide icon in a translucent square.
- Page title and a short one-line description.
- Optional compact badge such as academic year or date.
- At most one or two necessary actions. Do not fill it with buttons.

Recommended structure:

```tsx
<section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-sky-600 px-4 py-4 text-white shadow-lg shadow-primary/15 sm:px-5">
  <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-sky-200/20" />
  <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
        <PageIcon className="size-5" />
      </span>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">Page title</h1>
        <p className="mt-0.5 text-xs text-white/75">Short, useful description</p>
      </div>
    </div>
  </div>
</section>
```

The dashboard greeting belongs inside the School Overview hero, not in the top navigation.

## 6. Cards

Cards should be compact and use color subtly.

### Metric card recipe

```tsx
<Card className="group relative gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/5">
  <CardContent className="relative p-2.5">
    {/* label, value, icon, progress and short note */}
  </CardContent>
</Card>
```

Rules:

- Use `p-2.5`, `p-3`, or `p-4`; avoid large default empty areas.
- If shadcn Card creates unwanted vertical space, add `gap-0 py-0`.
- Use `shadow-sm`; reserve `shadow-lg` for branded heroes.
- Use one pale gradient per card, not a saturated rainbow background.
- Icon tile: usually `size-8` or `size-9`, `rounded-lg`, strong color, white icon.
- Value: `text-lg font-bold`; label: `text-xs`; note: `text-[11px] text-muted-foreground`.

## 7. Forms and filters

- Inputs, selects, payment fields, and remarks fields should normally have a white/card background in light mode: `bg-white dark:bg-input/30`.
- Group related filters inside one compact card or toolbar.
- Keep labels close to fields and use `text-xs font-medium`.
- Dropdown menus should align with their trigger and should not be unnecessarily wide.
- Long selects must use a sensible maximum height such as `max-h-64`.
- Selected navigation/dropdown items retain their module color; do not force every active state to global turquoise.
- Active icons on a strong colored tile must be white.

Example toolbar:

```tsx
<Card className="gap-0 border-primary/15 bg-card/95 py-0 shadow-sm">
  <CardContent className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
    {/* compact tabs, selects, search and summary chips */}
  </CardContent>
</Card>
```

## 8. Buttons

- Primary business action: standard primary button.
- Hero action on a saturated background: white or pale module-colored button.
- Destructive actions: red only.
- Keep labels short and include a relevant `size-3.5` or `size-4` icon.
- Typical compact action: `h-8 gap-1.5 px-2.5 text-xs`.
- Avoid placing three or more large actions in a page hero. Move secondary actions to the relevant content section.

## 9. Navigation

### Top navigation

- Uses `bg-brand-header` and light foreground content.
- Keep only global controls: sidebar toggle, search, academic year, notifications, theme, and profile.
- Do not put dashboard-only greetings or page actions here.

### Left sidebar

- Uses `bg-brand-sidebar`.
- White/light icons and labels must maintain good contrast.
- Active rows use a darker translucent surface and a slim white indicator.
- Parent and child menu spacing must stay compact.

### Quick navigation strip

Each module keeps its own color in icon and active state:

- Student List: sky.
- Timetable: violet.
- Exam: amber.
- Collect Fees: emerald.
- Attendance: rose.
- Inventory: orange.
- Admission: cyan.
- Account Reports: indigo.

## 10. Tables and timetable grids

- Wrap tables in a rounded bordered surface.
- Use a softly tinted header row.
- Keep row padding compact while preserving readability.
- Status should be represented with small badges, not full-cell saturated backgrounds.
- Numeric/money columns should align consistently.
- Sticky headers are preferred for long timetable grids.
- Timetable subjects may use distinct pastel colors, but the same subject must always keep the same color.
- Legends should be compact horizontal strips, not tall cards with blank space.

## 11. Typography and icons

- Page title: `text-xl font-bold tracking-tight`.
- Section title: `text-base` or `text-lg font-semibold`.
- Card label: `text-xs font-medium text-muted-foreground`.
- Body text: `text-sm`.
- Helper/meta text: `text-[11px]` or `text-xs text-muted-foreground`.
- Use Lucide icons only. Default icon sizes are `size-3.5`, `size-4`, `size-5`, and `size-6` depending on hierarchy.
- Pick literal, recognizable icons. Avoid decorative AI-style symbols.

## 12. Light and dark mode

Every new surface must include a dark-mode treatment.

Example:

```txt
border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50
dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-emerald-500/5
```

Never use a fixed white background without a dark fallback. Never use a pale text color that becomes unreadable in dark mode.

## 13. Responsive and accessibility rules

- All actions remain reachable at mobile widths.
- Use `flex-col sm:flex-row` or responsive grids rather than fixed desktop layouts.
- Preserve visible focus states and keyboard navigation from Radix/shadcn.
- Icon-only buttons require an accessible label or tooltip.
- Decorative shapes require `aria-hidden`.
- Color cannot be the only status indicator; pair it with a label, icon, or badge.
- Disabled controls must remain visibly disabled and readable.

## 14. What not to do

- Do not change business logic while performing a visual-only task.
- Do not hardcode `#156974` repeatedly inside page components; use `primary` tokens.
- Do not use oversized cards or large empty sections.
- Do not add nested page scrollbars.
- Do not use different active colors from a module's established color.
- Do not make inputs translucent when the requested style requires clear white fill areas.
- Do not add unnecessary animations; use subtle hover elevation and short transitions.
- Do not add new dependencies for styling already supported by Tailwind, shadcn, or Lucide.

## 15. Implementation checklist

Before handing off a page, verify:

- [ ] It uses the shared turquoise brand tokens.
- [ ] The page hero matches the established gradient style.
- [ ] Cards are compact and do not contain unnecessary blank space.
- [ ] Supporting colors are meaningful and consistent.
- [ ] Inputs and dropdowns are aligned and readable.
- [ ] Module active states retain their own color.
- [ ] Mobile layout wraps/stacks correctly.
- [ ] Dark mode remains readable.
- [ ] No unwanted local scrollbar was introduced.
- [ ] Existing permissions and business behavior are unchanged.
- [ ] ESLint passes for changed TypeScript/TSX files.
- [ ] `git diff --check` passes.

## 16. Reference files

Use these implementations when visual details are unclear:

- Theme tokens: `src/app/globals.css`
- Theme palette: `src/lib/theme-palettes.ts`
- Top and quick navigation: `src/components/app-shell.tsx`
- Left navigation: `src/components/app-sidebar.tsx`
- Dashboard patterns: `src/components/dashboards/school-admin-dashboard.tsx`
- Student page patterns: `src/features/students/pages/students-page.tsx`
- Timetable patterns: `src/features/academics/pages/timetable-page.tsx`
- Fee collection patterns: `src/features/fees/pages/fee-collections-page.tsx`

When this guide and an old screenshot disagree, use the current shared tokens and current reference components as the final source of truth.
