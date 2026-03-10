---
read_when:
  - updating dashboard visuals or chart styling
  - changing sync defaults, privacy rules, or public-repo hygiene
---

# Project Guidelines

## Brand and UI Palette

Use this palette consistently across cards, charts, states, and focus treatment.

### Primary brand

- Primary action: `#009DE0`
- Hover: `#1FA9E4`
- Pressed: `#33B1E6`
- Selected: `#29ADE5`
- Disabled: `#5CC0EB`

### Light backgrounds

- Main page background: `#FFFFFF`
- Brand wash: `#F5FBFE`
- Light brand surface: `#EBF7FD`
- Soft brand surface: `#E0F3FB`
- Stronger brand surface: `#D6EFFA`
- Elevated brand surface: `#C2E7F8`

### Neutrals

- Primary text: `#202125`
- Muted text: `#202125A3`
- Secondary surface: `#EDEDEE`
- Hover surface: `#DBDBDC`
- Pressed surface: `#C9CACB`
- Default border: `#E4E4E5`
- Strong border: `#B8B8B9`

### Semantics

- Success: `#1FC70A`
- Warning: `#FC6200`
- Error: `#F93A25`
- Focus outline on light theme: `#0F2594`

## UI Usage Rules

- Keep the page on a light theme. Brand color should feel clean and product-like, not pastel-washed.
- Cards should sit on white or near-white surfaces with restrained blue brand tinting.
- Primary chart lines should use cyan blue first, then success green, warning orange, and deep indigo as supporting series.
- Muted copy must still meet contrast comfortably. Avoid low-opacity text over tinted surfaces.
- Focus states should be obvious. Prefer the deep indigo focus color for keyboard-visible outlines.

## Accessibility

- Default body copy and labels must remain readable on desktop and mobile.
- Do not rely on color alone to explain multi-series charts; legends or direct labels are required.
- Long venue, item, and money strings must wrap instead of overflowing.
- Revalidate changed layouts in Chromium desktop and mobile viewports before shipping.

## Sync and Privacy Rules

- Never hard-code a real user email in source, docs, or examples.
- `--userEmail` should be passed explicitly or supplied through `WOLT_USER_EMAIL`.
- `--expectedOrderCount` is optional in code, but recommended in real use so the catalog phase can fail fast when history is incomplete.
- Keep all real SQLite history files out of git.
- Keep Wolt auth tokens, cookies, local profile config, screenshots, and browser profiles out of git.

## Public Repo Hygiene

Safe to commit:

- application source
- tests with fake emails and fake IDs
- docs and setup instructions

Do not commit:

- `static/data/*.sqlite`
- `static/data/*.db`
- `.wolt*` config files
- screenshots generated from personal history
- any file containing real email addresses, tokens, or cookies
