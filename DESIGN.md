# FeatherLaneFlight design system

Status: design baseline v1; P02 foundation preview approved and implemented locally for review. Updated October 28, 2026.

This guide defines the UI foundation before feature screens. [design-tokens.json](design-tokens.json) owns exact visual values; this guide owns their use. The [engineering specification](docs/EngineeringSpec.md) owns workflows, API contracts, and status semantics. [AGENTS.md](AGENTS.md) owns coding and test-writing rules. The project-local UI UX Pro Max skill is installed; the approved theme, shared shell/page layout, status presentation, and reference view now live under `src/web/`. The original approval preview remains isolated under `previews/P02/`.

## UI library decision

Use **MUI Core and Material Icons**, with the default supported Emotion styling engine. Use existing controls directly and customize them through one central theme. Add small product components for repeated behavior or composition.

| Option     | Fit for this project                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MUI        | Chosen for its prebuilt React controls and central theme. It suits forms, navigation, tables, dialogs, and engineering status displays.                                     |
| Mantine    | A strong alternative with a theme provider and AppShell. Reconsider if its visual direction better suits the product before implementation begins.                          |
| Ant Design | A strong alternative for extensive business-table interactions. Reconsider if advanced table features become a primary product requirement.                                 |
| shadcn/ui  | Useful when owning and changing component source is a priority. Its source-ownership approach would leave more local UI code to maintain than this project currently needs. |

MUI is the proposed fit for this product, rather than a universal ranking. Keep one primary component library throughout the application. Extensive local overrides or a wrapper for every library primitive would undermine the reason for using prebuilt components.

Initial runs, runners, and artifact lists use **MUI Core Table**, bounded API pages, and shared Previous/Next cursor controls. Filters request matching server results; do not imply that filtering one loaded page searches every run. Sorting is offered only when the API supports the corresponding field/order. Preserve ordinary navigation links and explicit row actions.

MUI X Community Data Grid is an optional later addition if virtualization or grid interactions are needed. Qualify its API cursor integration and current limits first. Advanced X features may require Pro/Premium licensing. Do not make a commercial package an implicit dependency of the first UI.

## Visual direction

Use a near-black canvas, subtly separated panels, fine borders, small corner radii, bright yellow accents, clear typography, and compact data displays. Preserve shared navigation and mission-testing workflows. Define the visual treatment through central MUI theme values and component defaults.

Start with a dark color scheme. Use Hanken Grotesk for sans-serif body text with the token-defined system fallback. Use monospace for hashes, logs, compact metadata, and numeric identifiers. Pinned `@fontsource/hanken-grotesk` supplies local font files for the web entry; the app makes no font-service request. Keep application page titles compact and reserve large display headings for introductory content.

Use the semantic groups in [design-tokens.json](design-tokens.json):

| Token group                                             | Use                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `color.surface`                                         | Canvas, panel, raised overlay, hover, selected, and disabled backgrounds.                                        |
| `color.text`                                            | Primary, secondary, on-brand, and inactive-control text.                                                         |
| `color.border`                                          | Decorative separation, interactive outlines, and hover outlines.                                                 |
| `color.brand` / `color.focus`                           | Primary action states and visible keyboard focus.                                                                |
| `color.status`                                          | Explicit foreground/background pairs for success, failure, warning, pending, infrastructure, and neutral states. |
| `typography`, `spacing`, `radiusPx`, `shadow`, `motion` | Type hierarchy, rhythm, shape, elevation, and interaction timing.                                                |
| `breakpointPx`, `layoutPx`, `component`                 | Responsive composition, shared dimensions, controls, and table density.                                          |

Yellow identifies primary actions, active navigation, and deliberate emphasis. Outcome, warning, infrastructure, and connection states keep distinct labeled semantic roles. A decorative dot/grid texture is optional for an introduction or empty canvas; dense tables and evidence panels use quiet surfaces.

Map these choices through MUI's dark palette, typography, shape, component defaults/variants, and style overrides. Buttons use readable casing and dark text on yellow; panels use borders instead of elevated shadows; tables, dialogs, tooltips, menus, and inputs share the same surface hierarchy. Check hover, selected, disabled, focus, and validation states in the reference view. Preserve MUI's interaction behavior while changing presentation.

Run execution state, evaluation outcome, connection health, and cleanup state retain their separate meanings from the engineering specification. Pair status text with an icon or shape; color alone carries no critical information. A completed run does not automatically receive a passing appearance.

Update values in design-tokens.json when foundation review warrants a change. Introduce another color scheme only when the entire reference view works consistently with it.

## Brand mark

Use the approved **D / Impossible Lane** mark in `src/web/assets/brand/mark.svg`
for all product branding. Its three separate polygon planes, asymmetric opening,
open seams, hanging right toe, and projecting lower blade preserve the selected
artwork. Keep its original proportions and flat token-defined yellow.

`BrandMark` supplies the shared square header image for navigation and authentication
views. Keep the adjacent product name as readable text and the image decorative.
The small cut in `src/web/assets/brand/favicon.svg` widens the seams for browser
icons. The web entry also supplies ICO fallback, Apple touch and app icons, and a
manifest from `src/web/public/brand/`. All preview tabs use the same small SVG.

Approval source: in the logo-design chat on October 28, 2026, the user attached the
original **D / Impossible Lane** screenshot and wrote “i'll choose this”. After
reviewing the completed vector/icon kit, they instructed “Let's change of our logo
with this everywhere” and explicitly requested a separate worktree branch and PR.
This supersedes the earlier three-stroke mark; use the selected original D rather
than the later K/M variations. No review screenshots are included in the repository.

## Build from the top down

Every UI task follows **preview -> explicit user approval -> application implementation -> manual verification**. The preview must be rendered and shown to the user. A mockup or isolated browser prototype may contain minimal preview-only code and data; it is kept separate from application implementation and live integrations. After showing it, stop and request approval. Revise the preview when requested. Implement only the approved scope, with another preview required for a materially different direction or expanded scope. Reuse existing approval for the unchanged design.

```text
 Product vocabulary and screen requirements
                     |
                     v
 design-tokens.json: exact visual values
                     |
                     v
 Isolated visual preview shown to the user
                      |
                      v
 Explicit user approval for the shown scope
                      |
                      v
 MUI theme adapter: semantic mapping and defaults
                     |
                     v
 MUI component defaults and variants
                     |
                     v
 Shared application shell and page layouts
                     |
                     v
 Repeated product patterns and states
                     |
                     v
 Runs page -> detail -> comparison -> remaining workflows
```

| Step                      | Deliverable                                                                                 | Manual review before proceeding                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation preview     | Rendered theme/component reference, shell, and page composition using minimal mock data     | Show typography, spacing, focus, status distinctions, responsive layout, and representative states; obtain explicit user approval. |
| 2. Approved foundation    | MUI theme adapter, component defaults, shared shell/layouts, exhaustive status presentation | Implement the approved scope and manually verify the result against the preview.                                                   |
| 3. First feature preview  | Rendered Runs list and New simulation run workflow proposal                                 | Show the proposed layout, actions, and relevant states; obtain explicit user approval.                                             |
| 4. Approved first feature | Runs list and New simulation run workflow                                                   | Reuse the approved foundation; manually verify behavior and visual consistency.                                                    |
| 5. Remaining features     | Detail, comparison, suites, runners, settings                                               | Repeat the preview/approval gate for each UI task, then implement and manually verify its approved scope.                          |

Token tables, code, written descriptions, and ASCII diagrams do not replace a rendered preview. Silence and revision requests are not approval. Use a small isolated artifact or existing preview tooling without introducing a separate preview framework or Storybook setup. These gates do not authorize automated test writing.

## UI UX Pro Max workflow

The project-local [UI UX Pro Max skill](.agents/skills/ui-ux-pro-max/SKILL.md) is installed and its Python 3 search tool has been exercised. It provides development-time design guidance within the established MUI stack. Codex can discover it on the next turn; UI work should read this guide and the token file before using its recommendations.

The installation uses upstream revision `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03`, with Codex command paths adapted locally. Only the requested skill and its bundled data/scripts/references were installed. [Installation provenance](.agents/skills/ui-ux-pro-max/INSTALLATION.md) records the source and adaptations. No global install or companion skills were added.

From the repository root, request focused guidance without persisting a second design authority:

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py \
  "engineering dashboard dark" \
  --design-system -p "FeatherLaneFlight" -f markdown

python3 .agents/skills/ui-ux-pro-max/scripts/search.py \
  "table keyboard navigation" --stack react
```

Use React stack guidance and current official MUI documentation; the installed skill has no dedicated MUI stack. Treat suggestions as candidates constrained by this guide, design-tokens.json, existing contracts, and AGENTS.md. Accept useful density, readability, focus, and interaction guidance while retaining the defined palette, typography, and workflow. A generic landing-page recommendation does not define an application layout. Merge accepted rules into DESIGN.md and exact values into design-tokens.json. Start without `--persist`, which would create another MASTER/page-override hierarchy. Preserve the user's test-writing policy.

Example prompt:

> Use ui-ux-pro-max to review the UI foundation. Follow DESIGN.md, design-tokens.json, and AGENTS.md. Keep React, MUI, Material Icons, and the generated contracts. Propose theme and layout refinements first; keep application implementation deferred until requested.

## Token source and MUI mapping

[design-tokens.json](design-tokens.json) is the canonical, machine-readable value source. It is a small project-specific JSON document with `version: 1`; it requires no token compiler, extra runtime library, or parallel CSS token file. Values ending in Px or Ms explicitly declare their units.

The implemented `src/web/design/theme.ts` imports that JSON and maps it into MUI configuration, component defaults, and variants. It owns mapping logic rather than a second set of raw values. Apply the resulting theme through one root ThemeProvider and CssBaseline. MUI generates CSS variables for custom evidence visualizations and other CSS consumers.

| MUI destination                                           | Token source / rule                                                                                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette.mode`, `background.default/paper`, text, divider | Color scheme, canvas/panel, text, and decorative border tokens. Use raised surface for overlays.                                                                                                         |
| `palette.primary`                                         | Brand default/hover/pressed with explicit on-brand text; reuse these values in primary-button state overrides.                                                                                           |
| `palette.secondary` and secondary actions                 | Neutral foreground and an outlined treatment. Keep decorative/action colors within the defined semantic roles.                                                                                           |
| `palette.success/error/warning/info`                      | Success/failure/warning/pending roles. Infrastructure and neutral remain named custom roles. Status badges use their explicit foreground/background pairs.                                               |
| `action.hover/selected/disabledBackground`                | Explicit surface state colors; inactive controls use disabled text, while explanations remain readable secondary text.                                                                                   |
| `typography`                                              | Map compact body to body2, body to body1, page/section titles to heading variants, and caption/button to their matching variants. Code uses the mono family.                                             |
| Spacing, shape, breakpoints, transitions                  | Set MUI `spacing` to `spacing.unitPx`; `scalePx` is the preferred vocabulary, not an array to pass as MUI spacing. Use the other token-defined values directly and keep MUI's existing z-index ordering. |
| Component defaults and layout dimensions                  | Shared control heights, borders, focus ring, page dimensions, panel/dialog treatment, and table density.                                                                                                 |

Use pixel values as the reference scale; render type with rem sizes and proportional line heights so browser text settings work. Components grow with content/zoom. Use tabular numerals for metric columns, and right-align comparable numbers. Keep page text and status labels selectable.

The implemented `src/web/design/statusPresentation.ts` maps generated contract enums to labels, icons, and semantic theme roles. Contract types own the status vocabulary. Feature pages consume theme values; they do not redefine color ramps or component appearance. Simple local layout composition with MUI Stack, Box, or Grid is appropriate.

Token groups to review in the reference view:

| Area              | Token ownership / behavior                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Typography        | Explicit caption, compact body, body, section/page title, display, button, and code variants with sizes, line heights, and weights. |
| Spacing and shape | Central spacing base/scale, compact/default radii, border widths, focus offset, and panel/overlay shadows.                          |
| Navigation/header | Shared sidebar/header dimensions; temporary navigation drawer below md.                                                             |
| Page/content      | Shared desktop/narrow padding, section gap, form maximum, and check-pane width. Lists/details use available width.                  |
| Controls/table    | Desktop/touch control minimums and table-row minimum; content and text zoom can increase height.                                    |
| Detail split      | Check pane plus flexible evidence region; stack below lg.                                                                           |
| Motion            | Fast/normal/overlay durations with one easing; reduced motion removes nonessential transitions and changing metrics do not animate. |

Change values in the token JSON after review. Keep horizontal table scrolling inside the content region; page-level navigation and actions must remain usable.

### Contrast and component-state rules

Normal enabled text targets at least 4.5:1 contrast. Necessary interactive outlines target at least 3:1 against adjacent supported surfaces. Subtle dividers provide decorative separation; input boundaries use the control-border token. Focus uses the explicit ring width and offset. Placeholder/help text uses readable secondary text. Disabled text is reserved for genuinely inactive controls, with any explanation outside them kept readable. See [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

The initial palette was calculated with the WCAG relative-luminance formula: primary/secondary text reach at least 13.16:1 / 5.65:1 across enabled surfaces; on-brand text reaches 14.55:1; status pairs reach at least 5.74:1; control outlines reach at least 3.08:1. These are color-pair calculations, not a claim about a rendered application's overall conformance. Review actual hover, selected, focus, validation, disabled, and overlay composition when the UI exists.

Validation errors use the failure role and a field-level message. Warnings use orange; yellow retains brand/action meaning. Use text and icons alongside every domain status. Maintain the exhaustive contract-state map from engineering-spec section 6.3, including neutral execution COMPLETED and a separate evaluation outcome.

## Shared layouts

```text
 +------------------+------------------------------------------------+
 | FeatherLane      | Current section                      User menu|
 | Project selector +------------------------------------------------+
 | Runs             | Breadcrumbs                                    |
 | Compare          | Page title + description       Primary action  |
 | Test suites      +------------------------------------------------+
 | Runners          | Filters / tabs when applicable                 |
 | Settings         +------------------------------------------------+
 |                  | Page content                                   |
 +------------------+------------------------------------------------+
```

The P07 revised layout was explicitly approved in phase chat `01a18488-97df-7171-8c7d-17e7ff0eeed3`, turn `01a184a0-57f0-7a40-a0da-047ab7537134`, message `01a184a0-585f-7c41-a14e-8e3c86b10580`. Project selection belongs above the left navigation and inside the temporary navigation drawer on narrow screens. Organization selection belongs inside Settings; the top bar contains the current section and user controls. The approved Settings scope is organization and project create/select, with no role/permission matrix or member editor. Project visibility follows explicit organization and project membership; organization membership does not grant every project. Keep the sidebar selector, organization setting and loaded project content synchronized, and clear protected content before switching scopes.

`src/web/layouts/AppShell.tsx` owns navigation and the layout of supplied identity/project context. `src/web/layouts/PageLayout.tsx` owns the repeated title/action/filter/content alignment. Build them from MUI Drawer, AppBar/Toolbar, Box, Stack, and related primitives. Share navigation configuration so route labels and active states remain consistent.

| Page pattern  | Composition                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| List          | Page header, filters, bounded table, cursor controls, loading/empty/error region.                                 |
| Run detail    | Run metadata and separate state/outcome labels, trial/check navigation, selected evidence panel, artifact access. |
| Comparison    | Baseline/candidate selectors, eligibility explanation, matched metric/check rows, links to original evidence.     |
| Form/settings | Focused form width, visible labels/help/errors, grouped sections, consistent submission/cancellation actions.     |

A layout owns visual composition, not fetching or domain decisions. Feature query modules and generated contracts retain their existing responsibilities.

The approved P03 Runs workflow is implemented at `/runs`. New simulation run opens an inset modal Drawer from the right over the list. Its height and side insets live in `layoutPx.runPanel`, its desktop width reuses `formMaxWidth`, and its table width uses `runTableMinWidth`. Apply this geometry to that panel only; the shared navigation drawer keeps its own dimensions. The panel has a persistent title/close area and footer, with internal content scrolling. Preserve focus containment, idle Escape/backdrop dismissal, pending-close protection, normal opener restoration and the fallback when the empty-state opener disappears after acknowledgment. Run details remain unavailable in this mock workflow.

The approved P02 reference is implemented at `src/web/app/FoundationReference.tsx`. Run `pnpm dev` from the root and open <http://127.0.0.1:4200/>. The user approved the rendered foundation in phase chat `01a18386-034b-7453-8834-10d3a5e9f8c0` ("yes apply that for implement"); the exact source and manual evidence are recorded in `docs/phases/handoffs/P02.md`. No token changes were needed. Feature workflows and live identity/project data remain assigned to their later phases.

The approved P07 Settings UI now lives under `src/web/features/projects/` and is mounted at `/settings` with a clearly labeled local sample adapter. `ProjectSelector`, `OrganizationSettings`, `ProjectsTable` and `CreateProjectDialog` compose the shared layouts; `useCreateProjectForm` owns local form state. Empty/loading/error/access-loss presentations hide project content appropriately for each sample state. Dialog focus returns to its opener, with the persistent Create project button as fallback when an empty-state opener disappears. Backend identity/membership enforcement and API/query wiring remain pending P05/P06A integration.

## Component reuse

Use MUI Button, TextField, Select/Autocomplete, Dialog, Tabs, Alert, Skeleton, Chip, Table, and layout components directly with central defaults. Start with ordinary form state; add another form/state library only when the actual workflow warrants it.

Extract repeated product patterns such as RunStatusBadge, a project-aware page header, cursor navigation, or an evidence summary when they become shared. Keep the status map centralized. Build a trace timeline from typed events with simple MUI composition before considering a specialized visualization dependency.

Compose repeated loading/empty/error regions consistently, including a useful explanation and the relevant next action. Failed fetches retain visible context; missing evidence stays explicit. Confirm dialogs describe the specific action and outcome. Long IDs and hashes support copying without dominating the layout.

Use a consistent Material Icons set. Give icon-only buttons accessible labels. Manually verify keyboard operation, focus restoration in dialogs/drawers, field labels, contrast, zoom, reduced motion, and small-screen behavior. Library components provide a foundation; application composition still needs review.

## Sources

- [Material UI overview](https://mui.com/material-ui/getting-started/) and [installation](https://mui.com/material-ui/getting-started/installation/) support the prebuilt foundation and default styling engine choice.
- [MUI theming](https://mui.com/material-ui/customization/theming/) and [component defaults](https://mui.com/material-ui/customization/theme-components/) explain central theme configuration and derived CSS variables.
- [MUI dark mode](https://mui.com/material-ui/customization/dark-mode/) documents the theme mechanism for the proposed treatment.
- [MUI Table](https://mui.com/material-ui/react-table/), [responsive Drawer](https://mui.com/material-ui/react-drawer/), and [MUI X licensing](https://mui.com/x/introduction/licensing/) cover table/navigation primitives and commercial feature boundaries.
- [Mantine AppShell](https://mantine.dev/core/app-shell/) and [theme provider](https://mantine.dev/theming/mantine-provider/), [Ant Design Table](https://ant.design/components/table/) and [tokens](https://ant.design/docs/react/customize-theme/), and [shadcn/ui's source-ownership model](https://ui.shadcn.com/docs) are the alternatives considered.
- [UI UX Pro Max setup](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill#installation), [Codex platform template](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/src/ui-ux-pro-max/templates/platforms/codex.json), and [skill workflow](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md) support the optional development-time workflow above.

The product layouts, dimensions, visual direction, and implementation sequence above are proposed FeatherLaneFlight decisions.

## Run detail and evidence presentation

P04's approved detail view extends the P03 Runs screen through its existing Open action; it preserves the list, filters, columns, pagination and 95dvh New Run modal. Use the same project header, AppShell, PageLayout and separate execution/evaluation badges. Trial/check navigation sits beside the selected evidence above lg and stacks on narrow screens. Requested and observed manifests remain separate immutable snapshots; queued runs have no observed manifest.

Timeline uses a read-only terminal-style log with shared code typography, UTC/monotonic clock labels, ordered event names and indented messages. Wrap narrow lines and bound vertical scrolling; do not add command execution or infer success from empty output. `layoutPx.eventLogMaxHeightVh` and `layoutPx.manifestLabelWidth` own the approved geometry. Artifact metadata states availability, verification and retention explicitly, with missing/expired warnings; retain historical summaries without a regression verdict. Cancellation reports intent and pending/uncertain/rejected acknowledgments separately from confirmed Canceled or Error. UI components display validated outcomes and observations; they do not evaluate checks or optimistically advance execution.
