# Chapter 14 — The Frontend

## The Starting Point: A 1,419-Line Monster

Before Phase B, the auction detail page (`front/src/app/auctions/[id]/page.tsx`) was 1,419 lines long. It had:
- 17 `useState` calls
- 121 inline `style={{...}}` blocks
- Every bit of logic, every sub-component, every socket handler in one file

This is the frontend equivalent of a 10,000-line function. It worked, but it was impossible to maintain, impossible to test in isolation, and guaranteed to get worse with every feature addition.

The goal of Phase B was to fix this systematically. The auction detail page was split into 4 sub-components and an orchestrator of ~250 lines. The design system was extracted. The socket hooks were standardised.

---

## App Router Structure

```
front/src/app/
  layout.tsx              root layout: HTML skeleton + providers
  page.tsx                landing page (/)
  providers.tsx           React context providers: AuthProvider, TanStack, LiveTicker
  globals.css             CSS custom properties (the whole design system)
  middleware.ts           Next.js edge middleware for route protection (renamed proxy.ts)

  auth/
    login/page.tsx
    register/page.tsx

  auctions/
    page.tsx              catalogue (/auctions)
    create/page.tsx       create form (/auctions/create)
    [id]/
      page.tsx            auction detail orchestrator (~250 LOC)
      _components/
        BidHistory.tsx    bid list + auto-bid icons + ladder grouping
        KeyDetails.tsx    auction info panel
        PricePanel.tsx    bid form + auto-bid panel + Dutch accept
        WinnerCertificate.tsx  post-auction winner/loser state

  dashboard/page.tsx
  profile/[id]/page.tsx
  wallet/page.tsx
  watchlist/page.tsx
  admin/
    page.tsx              admin dashboard
    fraud/page.tsx        live fraud dashboard

  notifications/page.tsx
```

The `_components/` folder (with underscore) is a Next.js convention: these files are not route segments, just co-located components.

---

## The Design System

The design system lives in `front/src/components/ui/` and is exported from a single `index.ts`. Every primitive is used across every page.

### The CSS Variables Foundation

All colours, spacing, and typography live in `globals.css` as CSS custom properties:

```css
:root {
  --color-bg:          #ffffff;
  --color-surface:     #f8f9fa;
  --color-border:      #dee2e6;
  --color-text:        #212529;
  --color-text-muted:  #6c757d;
  --color-accent:      #0d6efd;
  --color-accent-dark: #0b5ed7;
  --color-success:     #198754;
  --color-warning:     #ffc107;
  --color-danger:      #dc3545;
  
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.1);
}

:root[data-theme="dark"] {
  --color-bg:          #0d1117;
  --color-surface:     #161b22;
  --color-border:      #30363d;
  --color-text:        #c9d1d9;
  --color-text-muted:  #8b949e;
  /* accent colours stay the same in dark mode */
}
```

Dark mode is applied by setting `data-theme="dark"` on the root element. The `ThemeBootstrap` component reads localStorage before React hydrates, preventing the flash of wrong theme.

### Component Inventory

| Component | Purpose |
|-----------|---------|
| `Button` | 6 variants: primary, secondary, danger, ghost, outline, link |
| `Input`, `Textarea`, `Select` | forwardRef'd form inputs |
| `Field` | Label + input + error text wrapper |
| `Card`, `CardHeader`, `CardBody` | Content containers |
| `Badge`, `AuctionTypeBadge`, `AuctionStatusBadge` | Coloured pills |
| `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonRow`, `SkeletonGrid` | Loading placeholders |
| `EmptyState` | "Nothing here yet" placeholder |
| `Stat`, `StatGrid` | Key-value metrics |
| `Alert` | 4 tone variants (info/success/warning/danger) |
| `PageHeader`, `Toolbar`, `PageShell` | Page layout structure |
| `Money`, `formatMoney` | Currency formatting (₹50,000.00) |
| `Tabs` | Tab navigation |
| `Countdown` | Live countdown with urgency states |
| `BidChart` | Price-vs-time SVG chart |
| `ThemeToggle`, `ThemeBootstrap` | Dark mode switch |

### The Countdown Component

The `Countdown` component shows time remaining until auction end. It has three visual states:

- **Normal** (more than 1 hour): plain clock display
- **Urgent** (under 1 hour): amber text
- **Critical** (under 30 seconds): red, bold, pulsing via `ah-pulse-urgent` CSS animation

It also adapts its tick rate: outside the critical state, it updates every second. Inside the critical state, it updates every 250ms. This prevents the displayed seconds from lagging by almost a second when counting down from 10.

### The BidChart Component

A dependency-free SVG price-vs-time chart. No Recharts, no Chart.js, no D3. Just math and SVG.

```
- x-axis: time from auction start to now
- y-axis: price from startingPrice to current max
- auto-bid dots: open circles (isAutoBid: true)
- manual bid dots: filled circles
- starting price: dashed horizontal baseline
- area under the line: light fill
- y-axis labels: formatted as money (₹X,XXX)
- x-axis labels: relative time ("5m ago", "now")
```

The chart subscribes to bid history via TanStack Query (which is invalidated on every `bid:new` socket event). It redraws on every new bid, showing the price history building up live.

---

## Live Bidding UI (Phase F)

Phase F added several components specifically for the live auction experience.

### LiveTicker

A floating stack of event notifications in the top-right corner. When you are watching an auction and someone bids, a toast slides in:

```
▲ Alice placed a bid — ₹45,000
```

When the auto-bid ladder fires:

```
⇈ Auto-bid ladder — 8 rungs resolved → ₹51,000
```

The ticker:
- Caps at 5 visible toasts
- Auto-dismisses after 4 seconds
- Hover pauses the dismiss timer
- Clears on `auction:ended`

Each toast kind has its own icon and accent colour, defined in `KIND_STYLE`:
```typescript
const KIND_STYLE = {
  manual:       { icon: '▲', color: 'var(--color-accent)' },
  ladder:       { icon: '⇈', color: 'var(--color-accent-dark)' },
  outbid:       { icon: '✕', color: 'var(--color-danger)' },
  extended:     { icon: '⏱', color: 'var(--color-warning)' },
  backpressure: { icon: '≋', color: 'var(--color-warning)' },
};
```

### LadderBanner

When the auto-bid ladder resolves, a banner slides in above the bid history:

```
Auto-bid ladder · 8 rungs resolved · ₹45,000 → ₹51,000
```

It fades after 3 seconds. Without this banner, the price jump from ₹45,000 to ₹51,000 has no explanation — a user might think the UI glitched.

### AutoBidHealth Card

Shows the viewer's auto-bid status with three derived states:

- **WINNING** (green): "Leading the auction"
- **EXHAUSTED** (red): "Cap reached — outbid by a higher limit"
- **ARMED** (amber): "Will auto-bid up to ₹X · Headroom ₹Y"

A capacity bar shows `currentBid / maxAmount` with a smooth CSS width animation. Cancel button is inline.

### BidHistory Ladder Grouping

Consecutive auto-bid rows within 2 seconds of each other are grouped with a left-edge accent line. This visually communicates "these eight bids were one atomic resolution" — users can see where the ladder started and ended.

Auto-bid rows get an `A` chip; manual bids get an `M` chip. The viewer's own rows get a subtle tint and a "you" badge.

### BidInputFeedback

As the user types a bid amount, live feedback appears:
- **Below minimum** (red): "₹1,000 below minimum"
- **At minimum** (neutral): "✓ Meets minimum bid"
- **Above minimum** (green): "₹5,000 above minimum"

No submit needed. The user knows before clicking whether their bid will be accepted.

### ConnectionStatus

Tri-state indicator in the Navbar:
- **Connected**: renders nothing (assume normal)
- **Reconnecting**: amber pulsing dot + "Reconnecting..."
- **Offline**: red dot + "Offline — last update N seconds ago"

Critical for real-time trust: without this, a user with a flaky connection sees stale prices with no indication they are not live.

---

## The Auth Store

```typescript
// front/src/store/authStore.ts
interface AuthState {
  user: User | null;
  token: string | null;
  isHydrated: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isHydrated: false,
      setAuth: (user, token) => set({ user, token }),
      clearAuth: () => set({ user: null, token: null }),
    }),
    {
      name: 'auth-store',
      onRehydrateStorage: () => (state) => {
        if (state) state.isHydrated = true;
      },
    }
  )
);
```

The `isHydrated` flag starts `false`. When Zustand reads from localStorage (the `persist` middleware), it sets `isHydrated = true`. Components that should render differently based on auth state gate on `isHydrated`:

```typescript
function Navbar() {
  const { user, isHydrated } = useAuthStore();
  
  if (!isHydrated) return <NavbarSkeleton />;
  if (!user) return <LoggedOutNav />;
  return <LoggedInNav user={user} />;
}
```

Without `isHydrated`, the server renders `<LoggedOutNav />` (because localStorage is unavailable on the server), hydrates, then immediately switches to `<LoggedInNav />`. The user sees a flash of the logged-out navbar. With `isHydrated`, you show a skeleton (neutral) until the client knows which state to render.

---

## Form Validation with Zod

`front/src/lib/contracts.ts` mirrors all the backend Zod schemas. Example:

```typescript
export const createAuctionSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(2000),
  type: z.enum(['ENGLISH', 'DUTCH', 'SEALED_BID']),
  startingPrice: z.number().positive(),
  endTime: z.string().datetime(),
  // ... plus .superRefine for cross-field rules
}).superRefine((data, ctx) => {
  if (data.type === 'DUTCH' && !data.dutchPriceStep) {
    ctx.addIssue({ code: 'custom', message: 'Dutch auctions require a price step', path: ['dutchPriceStep'] });
  }
});
```

The `useZodForm` hook handles form state:

```typescript
export function useZodForm<T>(schema: ZodType<T>) {
  const [values, setValues] = useState<Partial<T>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  
  function validate(): T | null {
    const result = schema.safeParse(values);
    if (!result.success) {
      setErrors(zodIssuesToErrors(result.error.issues));
      return null;
    }
    return result.data;
  }
  
  return { values, setValues, errors, validate, submitting, setSubmitting };
}
```

Field-level errors appear as the user interacts, not just on submit. The same validation rules as the server mean users cannot submit a form that will be rejected by the API (for client-side-catchable errors).

---

## CSS Animations and Reduced Motion

Phase F added 7 CSS keyframe animations:

```css
@keyframes ah-toast-in { from { transform: translateX(120%); opacity: 0; } to { ... } }
@keyframes ah-pulse-urgent { 0%, 100% { transform: scale(1); color: var(--color-danger); } 50% { ... } }
@keyframes ah-ladder-cascade { 0% { opacity: 0.5; } 100% { opacity: 1; } }
/* ... */
```

Accessibility: all animations are disabled for users with `prefers-reduced-motion: reduce`:

```css
@media (prefers-reduced-motion: reduce) {
  .ah-toast, .ah-pulse-urgent, .ah-ladder-cascade,
  .ah-banner-drop, .ah-banner-fade, .ah-conn-pulse, .ah-banner-shake {
    animation: none !important;
    transition: none !important;
  }
}
```

The UI states (colour, text) still communicate the information. Only the kinetic effects are removed. This is the correct accessibility-first approach.

---

## Next Chapter

Chapter 15 covers testing and benchmarks — how we verified the code works (Jest), how we measured performance (k6), and what the 28.5x throughput number actually means.
