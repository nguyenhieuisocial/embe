# EmBe mobile-first redesign — 9 September 2026

Status: in progress. A design file or passing source check is not completion.

Figma: https://www.figma.com/design/TWDcsuDDn4ugRhmgaNa8JW

## Scope and acceptance

Preserve the family's working data and all existing features. Redesign navigation, hierarchy, density, feedback and mobile controls. Do not change clinical facts, merge conflicting prescriptions, or infer that a medicine was taken as a design shortcut. No real health data or private photographs are sent to Figma; examples are synthetic.

- Common foundation: paper/surface/rose from globals.css; semantic mint for completion, peach for food, lavender for records, coral only for warnings. Sentence case, Be Vietnam Pro interface, Noto Serif page titles. Inputs 16px, touch target at least 44px; compact presentation does not mean tiny controls.
- One primary action per view. Secondary details closed by default except explicit deep links and validation recovery. No lost draft on tab switch.
- Group features by task, not by integration. Medication is not an iPhone setting. Studio stays separate from private health data.
- Verify mobile at 375/393/430px, tablet/desktop, keyboard/reduced motion, navigation and empty/error/saved states. Physical iPhone testing remains separate evidence.
- Deploy approved changes through main; verify the deployed version and relevant authenticated screens.

## Work ledger

| Area | Evidence / problem | Status |
|---|---|---|
| Baseline | 25 read-only routes, 393/1280px; screenshots in private data/interface-audit | Captured |
| Figma foundation | 42 variables, five text styles, one effect, four Action states; three pages | MCP Starter quota blocks remaining components/screens |
| Common layout | Shared typography/spacing/44px targets, 16px native fields, area colors; bare/print excluded | Implemented; live checks pending |
| Planning | Node weekday 'Thứ 4' differs from Cent 'Th 4'; deterministic labels and shorter task-first page | Fixed, tests pass |
| Health recording | Checkbox appearance/size inconsistent; grouping needs review | Pending |
| Medication | Direct /me-bau/thuoc route; legacy fragments retained; drafts retained between tabs; honest saved/eligible state | Implemented, regression checks pass |
| Medical records | Flatter summary/disclosures, upcoming visit lavender, compact date cards; sources retained | Implemented; visual CSS preview inspected |
| Meals | Camera/manual correction and history need unified workflow | Pending |
| Memories/journal | Photo-focused browsing and controls need consistent presentation | Pending |
| Studio | Separate creation/research/publishing hierarchy | Pending |
| Remaining routes | Apply shared standard and inspect route-specific issues | Pending |
| Verification/deployment | 233 tests across 17 suites and production build pass; CSS preview inspected on three live routes | Deployment pending |

## Figma v1 mapping

Foundation uses existing CSS tokens: paper, surface, ink, ink-soft, rose, rose-press, rose-soft, line, mint, mint-soft, peach, peach-soft, lavender, lavender-soft, coral, coral-soft; gutter/radius-sm/radius-md/tap/control; new spacing-1/2/3/4/6 = 4/8/12/16/24px shared by implementation. Light only, matching the app. Text styles: Page title, Section title, Body, Caption, Action. Shadow: existing shadow-card. Components: Action (primary/secondary, default/pressed/disabled/busy), navigation row and disclosure header; screens compose instances. No replacement with community-kit fonts or unrelated colors.

Full task remains open until the ledger is resolved or a concrete access/device limitation is reported. Baseline screenshots are private, not committed.

Local production preview returned host-policy 404 initially, then login did not complete. Those screenshots are NOT accepted as UI evidence. The audit now fails on non-2xx, login redirects or missing h1. CSS preview on authenticated production is explicitly marked previewCss, not deployed-component proof. No auth configuration was changed in source; the temporary local server has been stopped.

Figma generation is incomplete due to the Starter MCP call quota; no paid upgrade was purchased. `figma-state.json` records actual created IDs and pending work. The app uses the same source tokens, but Code Connect and finished screen mockups are not claimed.
