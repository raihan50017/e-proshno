---
name: ui-from-screenshot
description: How to build an e-proshno screen from a reference screenshot (e.g. files in documents/) — reproduce layout and workflow with our own brand, components and copy, then visually verify. Use when the user attaches or points to a UI image to build from.
---

# Building a screen from a reference screenshot

## 1. Decompose before coding
Write a short breakdown:
- **Regions**: e.g. sidebar, top bar, main card, right filter panel.
- **Components** per region: inputs, selects, modals, cards, toggles, tables, charts.
- **Data** each component shows, and where it comes from (model/field or new endpoint).
- **Interactions & states**: selection, disabled, validation messages, loading, empty, error, no-subscription.
- **Responsive behaviour**: what collapses at tablet and phone widths (sidebar → sheet, right panel → drawer).

## 2. Map to our system
- Primitives from shadcn/ui (`Sidebar` for the grouped app navigation, `Button`, `Card`, `Dialog`, `Select`, `Switch`, `Checkbox`, `Tabs`, `Sheet`,
  `Command` for searchable pickers, `Slider`), icons from lucide-react, charts from Recharts.
- Colours, radii and fonts come from our Tailwind theme tokens only — no hex values copied from the screenshot.
- Text follows the `bangla-ui` glossary. Rewrite copy in our own words.

## 3. Brand hygiene (mandatory)
- Never reuse the reference product's logo, name, illustrations, banners, promo images or marketing text.
- Replace promo areas with our own `Banner` component driven by admin-managed data.
- Sample content in mocks must be our own seed data, not text transcribed from the screenshot.

## 4. Build
- If the endpoint doesn't exist yet, define the C# request/response DTOs and controller signature first, run
  `pnpm api:gen`, and serve fake data with MSW handlers in `frontend/src/mocks/` until the handler is implemented.
  Screens always consume the generated hooks, so swapping to the real API needs no UI changes.
- Screens live in `frontend/src/features/<area>/`; add missing primitives with `pnpm dlx shadcn@latest add <name>`.
- Build at 1440px first, then 1024px and 390px.

## 5. Verify visually
- Run the app and open the page (Playwright MCP or `/run` if available); capture a screenshot at 1440px.
- Compare side by side with the reference: list layout differences (spacing, hierarchy, alignment, density),
  fix the ones that matter for usability, and note intentional differences.
- Check keyboard navigation and focus rings on interactive elements.
