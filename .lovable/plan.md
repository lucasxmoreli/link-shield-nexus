

## Updated Plan: 5-Plan Pricing Grid in Account Settings

### What Changed from Previous Plan
- **5 plans** instead of 4: new **FREE** plan as the first card
- Grid layout: `xl:grid-cols-5` on large screens, horizontally scrollable on smaller screens

### Implementation (single file: `src/pages/AccountSettings.tsx`)

**1. Add Tabs layout**
- Import Tabs components from shadcn
- Remove `max-w-2xl` constraint
- Tab 1 "Account": existing Profile + Plan Usage cards
- Tab 2 "Subscription": new pricing grid

**2. Pricing Grid Container**
- Use `flex overflow-x-auto gap-6 pb-4 xl:grid xl:grid-cols-5` — scrollable on small screens, 5-column grid on xl+
- Each card has `min-w-[260px] flex-shrink-0` for scroll behavior

**3. Plan Data Array (5 plans)**

| # | Name | Price | Clicks | Domains | Extra Click | Visible Icons | Button | Button Style |
|---|------|-------|--------|---------|-------------|---------------|--------|-------------|
| 0 | FREE | $0/mo | 0 | 0 | N/A | 0 (all gray) | "Current Plan" | Disabled/gray `bg-muted text-muted-foreground cursor-not-allowed` |
| 1 | BASIC | $97/mo | 20,000 | 3 | $0.01 | 2 | "Select Plan" | `bg-primary` |
| 2 | PRO | $297/mo | 100,000 | 10 | $0.004 | 8 | "Upgrade to Pro" | `bg-orange-500` |
| 3 | FREEDOM | $497/mo | 300,000 | 20 | $0.002 | All (10) | "Select Plan" | `bg-primary` |
| 4 | ENTERPRISE | $997/mo | 1,000,000 | 25 | $0.001 | All (10) | "Select Plan" | `bg-primary` |

**4. Card Visual Structure**
- Container: `bg-card border border-border rounded-xl p-6 flex flex-col`
- PRO card: extra `border-primary/50 ring-1 ring-primary/30 shadow-[0_0_30px_hsl(271,81%,56%,0.15)]` + "BEST OPTION FOR YOU" badge
- Plan name: `text-xs font-semibold tracking-widest uppercase text-muted-foreground`
- Price: `text-4xl font-bold` + `/mo` suffix
- Description: `text-sm text-muted-foreground`
- Features: list with Check icons (`text-green-500`); FREE plan uses X icons (`text-red-400`) for restricted features
- Traffic icons: 10 colored circles, visibility controlled by `visibleSources` count, rest at `opacity-20`
- Button: pinned to bottom with `mt-auto`, full width
- FREE button: `disabled` attribute + muted styling

**5. Button onClick**
- FREE: disabled, no action
- Others: `toast({ title: "Upgrade feature coming soon" })`

