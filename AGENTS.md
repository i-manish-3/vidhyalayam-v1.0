# Project Conventions

## Modal / Dialog UI Style (My Profile & Cancel Collected Fee pattern)

Whenever building or restyling a modal (user says "make the modal UI like this"), follow the style used in:
- `src/components/app-shell.tsx` (My Profile dialog, ~line 971)
- `src/app/(app)/fees/list/fee-payment-cancellation.tsx` (Cancel Collected Fee dialog)

Structure:

1. **DialogContent**: `flex max-h-[90svh] flex-col overflow-hidden border-{color}/20 bg-card p-0 shadow-2xl shadow-{color}/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100`
2. **DialogHeader**: `relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,...)] px-5 py-4 pr-12 text-white sm:px-6` — brand-colored gradient, 2-3 decorative circles/blurs (absolute divs with `border-[18px] border-white/10`, `bg-*-300/20 blur-2xl`), icon in a `size-11 rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm` tile, `DialogTitle` text-lg font-bold white, `DialogDescription` text-xs text-white/75.
3. **Body**: `<div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-{color}/[0.03] via-background to-{color}/[0.055] p-4 sm:p-5">` containing sections.
4. **Sections**: `relative overflow-hidden rounded-xl border border-{c}-200/80 bg-gradient-to-br from-{c}-50 via-white to-{c}-50 p-4 shadow-sm dark:border-{c}-500/25 dark:from-{c}-500/15 dark:via-card dark:to-{c}-500/10` with a header row: icon in `size-8 rounded-lg bg-gradient-to-br from-{c}-500 to-{c}-600 text-white shadow-sm`, `h3 text-sm font-semibold`, `p text-[10px] text-muted-foreground`.
5. **Footer**: `DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5"` with small buttons (`size="sm" h-8 px-4 text-xs`).