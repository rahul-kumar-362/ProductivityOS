# Design: design-system

> A dark-first, Linear/Raycast-inspired token system built on CSS custom properties consumed by Tailwind via `<alpha-value>`-aware `rgb(var(...))` tokens. Themes switch by toggling a `data-theme` attribute on `<html>`, set by a tiny blocking inline script before first paint to eliminate FOUC. Includes semantic color tokens for dark+light, full spacing/radius/type/shadow/motion scales, a concrete tailwind.config.ts + tokens.css, and the MVP component inventory. Restrained: flat surfaces, hairline borders, one accent (indigo/violet), no gradients or noise.

## Decisions

- Colors stored as raw space-separated RGB channel triplets in CSS vars and consumed via rgb(var(--x) / <alpha-value>) so all Tailwind opacity modifiers work off a single variable
- Theme is an explicit data-theme attribute on <html> (values 'dark'|'light'), never driven by @media prefers-color-scheme in CSS; JS resolves 'system' choice
- Dark is the default/reference theme; index.html ships with data-theme='dark' hardcoded
- Zero-flash via a render-blocking inline script in <head> that sets data-theme before first paint, plus a critical inline style setting html background, plus matching Tauri window background color
- Theme transitions animate ONLY on explicit user toggle via a temporary .theme-transition class, so cold start never flickers
- Single accent color: indigo/violet primary (#816EF7 dark / #6C54F0 light); success/warning/danger reserved for status only
- Base UI font size is 14px (dense desktop app), Inter variable + JetBrains Mono bundled locally as woff2 (offline-first, no CDN)
- font-variant-numeric: tabular-nums set globally so timer/stat digits don't jitter
- Depth via surface-lightness steps + hairline borders; shadows reserved for genuinely floating layers (popover/modal/timer); no gradients or noise
- Tailwind darkMode set to selector [data-theme='dark'] to align with our own theme control
- config/theme.ts is the single JS source of truth for motion/chart values; tokens.css is the single CSS source of truth — no hardcoded values in components
- Recharts colors resolved to concrete rgb() strings via a useThemeColors() hook (SVG cannot consume rgb(var()) with alpha in all props)

## Design System — ProductivityOS

### 0. Design philosophy (locked)
- **Dark-first.** Dark is the default and the reference theme; light is a faithful inversion, not an afterthought.
- **Flat, layered depth.** Depth comes from surface lightness steps + hairline borders, NOT from shadows or gradients. Shadows are reserved for genuinely floating layers (popovers, the floating timer, modals).
- **One accent.** A single indigo/violet primary carries all interactive emphasis. Semantic colors (success/warning/danger) appear only for status, never decoration.
- **Calm motion.** 120–260ms, ease-out on enter. Respect `prefers-reduced-motion`.
- **No gradients, no noise, no glassmorphism blur as a crutch.** Transparency is used only where it is load-bearing (the floating timer window, overlays).

---

### 1. Token architecture

Two layers:

1. **Primitive/raw tokens** — the actual color values, defined once per theme as raw RGB channel triplets (space-separated, no `rgb()` wrapper) so Tailwind can inject `<alpha-value>`.
2. **Semantic tokens** — role-based names (`--surface`, `--text-primary`, …) that Tailwind maps to utility classes. Components only ever reference semantic tokens.

**Why channel triplets (`14 16 23`) not hex:** it lets every Tailwind color utility support opacity modifiers (`bg-surface/80`, `text-muted/50`) while still driving off a single CSS variable. This is the single most important mechanical decision here.

Colors are declared with `data-theme="dark"` / `data-theme="light"` scopes on `:root`. No `@media (prefers-color-scheme)` in CSS — the theme is always explicit and controlled by JS (which reads the OS preference on first run), so behavior is deterministic and toggleable.

---

### 2. Semantic color tokens

Every token below is a raw RGB triplet. Dark is the primary palette.

**Dark theme** (`data-theme="dark"`)
| Token | RGB | Hex | Role |
|---|---|---|---|
| `--bg` | `9 9 12` | `#09090C` | App backdrop (near-black, slight cool) |
| `--surface` | `18 18 23` | `#121217` | Cards, panels, sidebar |
| `--surface-elevated` | `26 26 33` | `#1A1A21` | Popovers, menus, modals, floating timer |
| `--surface-hover` | `33 33 41` | `#212129` | Row/button hover fill |
| `--border` | `39 39 48` | `#272730` | Hairline dividers, input borders |
| `--border-strong` | `55 55 66` | `#373742` | Emphasized/focused borders |
| `--primary` | `129 110 247` | `#816EF7` | Indigo-violet accent (buttons, active) |
| `--primary-hover` | `146 130 249` | `#9282F9` | Primary hover |
| `--primary-fg` | `255 255 255` | `#FFFFFF` | Text/icon on primary fill |
| `--accent` | `110 200 245` | `#6EC8F5` | Secondary highlight (charts, links) — used sparingly |
| `--success` | `61 199 130` | `#3DC782` | Green (all tasks done, positive delta) |
| `--warning` | `230 178 74` | `#E6B24A` | Amber (partial day) |
| `--danger` | `232 90 90` | `#E85A5A` | Red (none done, destructive) |
| `--text-primary` | `237 237 242` | `#EDEDF2` | Primary text (not pure white) |
| `--text-secondary` | `160 160 172` | `#A0A0AC` | Labels, secondary |
| `--text-muted` | `112 112 124` | `#70707C` | Placeholder, disabled, timestamps |
| `--focus-ring` | `129 110 247` | `#816EF7` | Focus outline (== primary) |
| `--overlay` | `0 0 0` | — | Modal scrim (used at `/60`) |

**Light theme** (`data-theme="light"`)
| Token | RGB | Hex | Role |
|---|---|---|---|
| `--bg` | `249 249 251` | `#F9F9FB` | App backdrop (off-white) |
| `--surface` | `255 255 255` | `#FFFFFF` | Cards, panels |
| `--surface-elevated` | `255 255 255` | `#FFFFFF` | Popovers/modals (lifted via shadow) |
| `--surface-hover` | `242 242 245` | `#F2F2F5` | Hover fill |
| `--border` | `228 228 233` | `#E4E4E9` | Hairline dividers |
| `--border-strong` | `208 208 216` | `#D0D0D8` | Emphasized borders |
| `--primary` | `108 84 240` | `#6C54F0` | Indigo-violet (slightly deeper for contrast on white) |
| `--primary-hover` | `93 68 226` | `#5D44E2` | Primary hover |
| `--primary-fg` | `255 255 255` | `#FFFFFF` | On-primary text |
| `--accent` | `36 150 210` | `#2496D2` | Secondary highlight |
| `--success` | `26 158 94` | `#1A9E5E` | Green |
| `--warning` | `183 128 20` | `#B78014` | Amber (darkened for white bg contrast) |
| `--danger` | `211 55 55` | `#D33737` | Red |
| `--text-primary` | `24 24 31` | `#18181F` | Primary text (not pure black) |
| `--text-secondary` | `88 88 100` | `#585864` | Secondary |
| `--text-muted` | `140 140 150` | `#8C8C96` | Muted |
| `--focus-ring` | `108 84 240` | `#6C54F0` | == primary |
| `--overlay` | `17 17 22` | — | Modal scrim (used at `/45`) |

Contrast: `text-primary` on `surface` and `text-secondary` on `surface` clear WCAG AA (≥4.5:1) in both themes; `text-muted` is AA-large only and is intended for non-essential metadata. `primary-fg` on `primary` clears AA in both.

---

### 3. Non-color scales

**Spacing** (4px base, `rem`-relative — 1rem = 16px):
`0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`. Extend Tailwind default with two customs: `4.5=18` and `13=52` (needed for the 52/17 method layout + compact timer). Otherwise Tailwind's default scale is kept — do not reinvent it.

**Radius:** `sm=6, md=8, lg=10, xl=14, 2xl=18, full=9999`. Default control radius = `md (8)`. Cards = `lg (10)`. Floating timer window = `xl (14)`. Pills/badges = `full`.

**Typography (Inter):**
| Token | size / line-height | weight | Use |
|---|---|---|---|
| `display` | 32/40 (2rem) | 600 | Big stat numbers, timer readout |
| `h1` | 24/32 | 600 | Page titles |
| `h2` | 20/28 | 600 | Section headers |
| `h3` | 16/24 | 600 | Card titles |
| `h4` | 14/20 | 600 | Sub-labels |
| `body` | 14/22 | 400 | Default UI text |
| `body-sm` | 13/20 | 400 | Dense lists |
| `caption` | 12/16 | 500 | Timestamps, meta, badges (uppercase optional, +0.02em tracking) |
| `mono` | 13/20 | 500 | Timer digits, durations, code |

Base UI font-size is **14px**, not 16 — correct for a dense desktop app. Fonts: `Inter var` (variable) with system fallback stack; mono = `JetBrains Mono`/`ui-monospace`. Enable `font-feature-settings: 'cv11','ss01'; font-variant-numeric: tabular-nums` globally so timer/stat digits don't jitter. Bundle Inter + JetBrains Mono as local `.woff2` (offline-first — no CDN, `font-display: swap`).

**Shadow / elevation** (tuned dark; kept very subtle):
- `--shadow-sm`: `0 1px 2px rgb(0 0 0 / 0.30)` — hover lift on cards
- `--shadow-md`: `0 4px 12px rgb(0 0 0 / 0.35)` — dropdowns, popovers
- `--shadow-lg`: `0 12px 32px rgb(0 0 0 / 0.45)` — modals, floating timer
- `--shadow-focus`: `0 0 0 3px rgb(var(--focus-ring) / 0.45)` — focus ring (via box-shadow, so it layers over borders)

Light theme overrides these to be softer/cooler (e.g. `--shadow-md: 0 4px 12px rgb(17 17 22 / 0.10)`). Because shadows are theme-scoped variables, `shadow-md` in JSX just works in both themes.

**Motion:**
- Durations: `--dur-fast: 120ms`, `--dur-base: 180ms`, `--dur-slow: 260ms`.
- Easings: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` (default enter), `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)` (moves), `--ease-spring` handled by Framer Motion springs for the timer window drag only.
- Global rule: wrap all non-essential transitions in `@media (prefers-reduced-motion: no-preference)`. Framer Motion components read a `useReducedMotion()` guard.

---

### 4. Wiring into Tailwind + zero-flash theme switching

**Mechanism:**
1. `tokens.css` defines `:root[data-theme='dark']` and `:root[data-theme='light']` blocks with the raw triplets, imported first in the entry CSS.
2. `tailwind.config.ts` maps semantic names to `rgb(var(--token) / <alpha-value>)` so every utility (`bg-surface`, `text-muted/60`, `ring-focus`) resolves through the variable and supports opacity.
3. Theme = `data-theme` attribute on `<html>`. A Zustand `settingsStore` holds `theme: 'dark' | 'light' | 'system'` (persisted). Changing it calls `document.documentElement.dataset.theme = resolved`.

**No-flash guarantee (two parts):**
- **FOUC of theme:** an inline, render-blocking script in `index.html` `<head>` (before the bundle) reads the persisted choice and sets `data-theme` synchronously, before first paint. This is the only reliable way to avoid the wrong-theme flash on cold start.
- **FOUC of styles:** set `data-theme="dark"` statically on the `<html>` element in `index.html` too, and set `background: rgb(var(--bg))` on `html` in a tiny critical style, so even before JS runs the window paints the correct backdrop (matches the Tauri window background — set `"windowBackgroundColor"` / native bg to the same `#09090C` in `tauri.conf.json` so there's no white flash from WebView2 itself).
- **No transition flash on toggle:** when the user actively switches themes, add a `.theme-transition` class to `<html>` for ~200ms that enables `transition: background-color, color, border-color` — but on initial load this class is absent, so cold start never animates. (Alternatively add a one-frame `disable-transitions` guard; the class-on-demand approach is simpler.)

Tauri specifics that matter for no-flash: set the WebView2 default background and the window `theme`/background in `tauri.conf.json` to the dark bg color, and keep the app window hidden until the webview emits ready (`app.get_webview_window(...).show()` after first render) for the sub-2s cold start with no white frame.

---

### 5. MVP component inventory

Grouped, built feature-agnostic in `src/components/ui/` (presentation only — no business logic per project principle). Logic lives in feature hooks/stores.

**Primitives**
- `Button` (variants: primary, secondary/subtle, ghost, danger; sizes sm/md; icon-only) 
- `IconButton`
- `Input`, `Textarea` (autosave-aware but dumb), `Select`, `Checkbox`, `Switch/Toggle`, `Slider` (opacity control), `SegmentedControl` (timer/method switch)
- `Badge` / `Tag` (status pills using success/warning/danger)
- `Kbd` (keyboard hint)
- `Avatar` — SKIP (single user, no need)

**Surfaces & overlays**
- `Card` / `Panel`
- `Modal` / `Dialog` (uses overlay + shadow-lg)
- `Popover` / `DropdownMenu` (menus, context menus)
- `Tooltip`
- `Toast` (native notifications preferred for OS-level; in-app toast for lightweight confirmations)

**Layout & navigation**
- `AppShell` (sidebar + content), `Sidebar` + `SidebarItem`
- `PageHeader`
- `Tabs`
- `EmptyState`, `Divider`, `ScrollArea`

**Feedback / data**
- `Spinner`, `ProgressRing` (Pomodoro/timer progress), `ProgressBar` (task completion rate)
- `Skeleton`
- `StatCard` (analytics numbers using `display` type + tabular-nums)

**Domain-shaped (thin, compose primitives)**
- `TimerReadout` (mono `display`, tabular-nums), `TimerWindowChrome` (transparent/draggable frame, opacity control, compact/mini states)
- `TaskItem` (checkbox + text + meta)
- `CalendarCell` (color-coded green/yellow/red via success/warning/danger tokens)
- `StreakBadge`
- `NoteEditor` (markdown surface — reuse Textarea + a rendered view toggle)
- `Chart` wrappers over Recharts, themed via CSS-var colors passed as props (`rgb(var(--primary))` won't work inside SVG fills computed by Recharts — resolve tokens to hex via a `useThemeColors()` hook that reads `getComputedStyle` on theme change).

One Recharts caveat worth flagging to the implementer: Recharts renders SVG and cannot consume `rgb(var(--x))` in all props. Provide a `useThemeColors()` hook that resolves the needed tokens to concrete strings on theme change and pass those into chart components.

---

### 6. Files & structure
```
src/
  styles/
    tokens.css        # theme variable blocks (raw triplets) + non-color vars
    globals.css       # @tailwind base/components/utilities + base element styles + fonts
  config/
    theme.ts          # TS mirror of scales/tokens for JS access (durations, chart colors)
  lib/
    theme/applyTheme.ts   # resolve 'system' -> dark/light, set data-theme
    theme/useThemeColors.ts
  components/ui/...
tailwind.config.ts
index.html            # inline no-flash script + static data-theme + critical bg style
```
Centralized config principle satisfied: `config/theme.ts` is the single JS source of truth for motion durations, easings, and resolved chart colors; `tokens.css` is the single CSS source of truth for color/spacing values. No magic values in components.

## Code Sketches

### index.html — no-flash bootstrap (in <head>, BEFORE the module script)
```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProductivityOS</title>
    <!-- critical: paint correct backdrop before any CSS/JS loads -->
    <style>
      html { background:#09090C; }
      html[data-theme='light'] { background:#F9F9FB; }
    </style>
    <!-- render-blocking: set theme before first paint, no FOUC -->
    <script>
      (function () {
        try {
          var s = localStorage.getItem('pos:theme'); // 'dark' | 'light' | 'system'
          var mql = window.matchMedia('(prefers-color-scheme: dark)');
          var resolved = (!s || s === 'system') ? (mql.matches ? 'dark' : 'light') : s;
          document.documentElement.dataset.theme = resolved;
        } catch (_) {
          document.documentElement.dataset.theme = 'dark';
        }
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### src/styles/tokens.css
```css
/* ---- Non-color scales (theme-independent) ---- */
:root {
  /* radius */
  --radius-sm: 6px;  --radius-md: 8px;  --radius-lg: 10px;
  --radius-xl: 14px; --radius-2xl: 18px;

  /* motion */
  --dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 260ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}

/* ---- DARK (default reference) ---- */
:root[data-theme='dark'] {
  --bg: 9 9 12;
  --surface: 18 18 23;
  --surface-elevated: 26 26 33;
  --surface-hover: 33 33 41;
  --border: 39 39 48;
  --border-strong: 55 55 66;
  --primary: 129 110 247;
  --primary-hover: 146 130 249;
  --primary-fg: 255 255 255;
  --accent: 110 200 245;
  --success: 61 199 130;
  --warning: 230 178 74;
  --danger: 232 90 90;
  --text-primary: 237 237 242;
  --text-secondary: 160 160 172;
  --text-muted: 112 112 124;
  --focus-ring: 129 110 247;
  --overlay: 0 0 0;

  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.30);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.35);
  --shadow-lg: 0 12px 32px rgb(0 0 0 / 0.45);
  --shadow-focus: 0 0 0 3px rgb(var(--focus-ring) / 0.45);
}

/* ---- LIGHT ---- */
:root[data-theme='light'] {
  --bg: 249 249 251;
  --surface: 255 255 255;
  --surface-elevated: 255 255 255;
  --surface-hover: 242 242 245;
  --border: 228 228 233;
  --border-strong: 208 208 216;
  --primary: 108 84 240;
  --primary-hover: 93 68 226;
  --primary-fg: 255 255 255;
  --accent: 36 150 210;
  --success: 26 158 94;
  --warning: 183 128 20;
  --danger: 211 55 55;
  --text-primary: 24 24 31;
  --text-secondary: 88 88 100;
  --text-muted: 140 140 150;
  --focus-ring: 108 84 240;
  --overlay: 17 17 22;

  --shadow-sm: 0 1px 2px rgb(17 17 22 / 0.06);
  --shadow-md: 0 4px 12px rgb(17 17 22 / 0.10);
  --shadow-lg: 0 12px 32px rgb(17 17 22 / 0.14);
  --shadow-focus: 0 0 0 3px rgb(var(--focus-ring) / 0.35);
}
```

### src/styles/globals.css
```css
@font-face {
  font-family: 'Inter var'; font-style: normal; font-weight: 100 900;
  font-display: swap; src: url('/fonts/InterVariable.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono'; font-weight: 400 700;
  font-display: swap; src: url('/fonts/JetBrainsMono.woff2') format('woff2');
}

@import './tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { background: rgb(var(--bg)); }
  body {
    background: rgb(var(--bg));
    color: rgb(var(--text-primary));
    font-feature-settings: 'cv11', 'ss01';
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }
  *:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
  /* opt-in transition only when user toggles theme (never on cold load) */
  html.theme-transition,
  html.theme-transition * {
    transition: background-color var(--dur-base) var(--ease-out),
                border-color var(--dur-base) var(--ease-out),
                color var(--dur-base) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
}
```

### tailwind.config.ts
```ts
import type { Config } from 'tailwindcss';

/** map a CSS var of raw channels to an alpha-aware color */
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['selector', "[data-theme='dark']"], // we drive theme ourselves
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: { DEFAULT: c('surface'), elevated: c('surface-elevated'), hover: c('surface-hover') },
        border: { DEFAULT: c('border'), strong: c('border-strong') },
        primary: { DEFAULT: c('primary'), hover: c('primary-hover'), fg: c('primary-fg') },
        accent: c('accent'),
        success: c('success'),
        warning: c('warning'),
        danger: c('danger'),
        text: { primary: c('text-primary'), secondary: c('text-secondary'), muted: c('text-muted') },
        focus: c('focus-ring'),
        overlay: c('overlay'),
      },
      borderColor: { DEFAULT: c('border') },
      ringColor: { DEFAULT: c('focus-ring') },
      borderRadius: {
        sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)', '2xl': 'var(--radius-2xl)',
      },
      spacing: { '4.5': '1.125rem', '13': '3.25rem' },
      fontFamily: {
        sans: ['Inter var', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        display: ['2rem', { lineHeight: '2.5rem', fontWeight: '600' }],
        h1: ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
        h2: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        h3: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        h4: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        mono: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '500' }],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)', md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)', focus: 'var(--shadow-focus)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)', 'in-out': 'var(--ease-in-out)',
      },
      transitionDuration: { fast: '120ms', base: '180ms', slow: '260ms' },
    },
  },
  plugins: [],
} satisfies Config;
```

### src/lib/theme/applyTheme.ts
```ts
export type ThemeChoice = 'dark' | 'light' | 'system';
const KEY = 'pos:theme';

export function resolveTheme(choice: ThemeChoice): 'dark' | 'light' {
  if (choice === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return choice;
}

/** Called by settings store. animate=true only on explicit user toggle. */
export function applyTheme(choice: ThemeChoice, animate = false): void {
  const el = document.documentElement;
  const resolved = resolveTheme(choice);
  localStorage.setItem(KEY, choice);
  if (animate) {
    el.classList.add('theme-transition');
    window.setTimeout(() => el.classList.remove('theme-transition'), 220);
  }
  el.dataset.theme = resolved;
}
```

### src/lib/theme/useThemeColors.ts — for Recharts (SVG can't read rgb(var()))
```ts
import { useSyncExternalStore } from 'react';

const TOKENS = ['primary', 'accent', 'success', 'warning', 'danger',
                'text-secondary', 'border'] as const;
type Token = (typeof TOKENS)[number];

function read(): Record<Token, string> {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    TOKENS.map((t) => [t, `rgb(${cs.getPropertyValue(`--${t}`).trim()})`]),
  ) as Record<Token, string>;
}

// re-read whenever data-theme changes
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

export function useThemeColors(): Record<Token, string> {
  return useSyncExternalStore(subscribe, read, read);
}
```

### Usage examples (component layer — pure Tailwind, no magic values)
```tsx
// Button (primary)
<button class="bg-primary hover:bg-primary-hover text-primary-fg
               rounded-md px-4 h-9 text-body font-medium
               transition-colors duration-fast ease-out
               focus-visible:shadow-focus disabled:opacity-50" />

// Card
<div class="bg-surface border border-border rounded-lg p-5 shadow-sm" />

// Muted timestamp with opacity modifier (why triplets matter)
<span class="text-caption text-muted/80" />

// Calendar cell — color-coded day status
<div class="rounded-md size-9 bg-success/15 text-success" />   // all done
<div class="rounded-md size-9 bg-warning/15 text-warning" />   // partial
<div class="rounded-md size-9 bg-danger/15 text-danger" />     // none

// Floating timer window chrome (elevated + transparent + draggable)
<div data-tauri-drag-region
     class="bg-surface-elevated/90 backdrop-blur-md border border-border
            rounded-xl shadow-lg p-4" style={{ opacity: 'var(--timer-opacity)' }} />
```


## Risks

- WebView2 can show a brief white flash on cold start before HTML paints if the native Tauri window background isn't set to match #09090C — must set windowBackgroundColor/native bg in tauri.conf.json AND keep the window hidden until first render, else the no-flash guarantee is incomplete.
- Recharts props that don't accept CSS custom properties will silently render wrong colors if a chart is added without going through useThemeColors() — needs to be documented for the analytics slice.
- backdrop-blur on the transparent floating timer can be GPU-costly on low-end hardware and may fight the <2s/lightweight goal; provide a fallback solid surface-elevated when transparency/blur is disabled in settings.
- Tailwind's selector darkMode plus our data-theme means any accidental use of dark: variants must still resolve through data-theme — mixing dark: utilities with semantic tokens could cause double-theming confusion; recommend components use ONLY semantic tokens and avoid dark: variants entirely.
- text-muted meets only AA-large contrast; must not be used for essential/interactive text.

## Open Questions

- Font licensing/bundling: confirm shipping Inter variable + JetBrains Mono woff2 locally is acceptable (both are OFL — yes, but confirm the exact files to vendor into /public/fonts).
- Should the floating timer window opacity be a CSS var (--timer-opacity) bound to the settings slider, or applied via Tauri window-level opacity? Recommend CSS var for per-element control; needs confirmation against the timer-window slice.
- Does the settings page expose the accent color as user-configurable, or is the indigo/violet locked for MVP? Recommend locked for MVP to stay lightweight.

