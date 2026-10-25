# EnvShare — UI/UX Design System and Product Interface Specification

**Document version:** 0.1  
**Status:** Design direction proposal for product discovery  
**Product:** EnvShare — Team Environment Variable Manager  
**Primary audience:** Companies and larger engineering teams  
**Design references:**
- Gumloop listing on Godly: https://godly.design/website/gumloop/
- Gumloop reference notes: https://swipefile.design/ref/ai-next-gumloop/
- Seto AI Workspace Dashboard by HALO LAB on Dribbble: https://dribbble.com/shots/26957747-AI-Workspace-Dashboard-UI-Design-Seto

---

## 1. Purpose

This document translates the visual principles of the two references into a practical UI/UX direction for EnvShare. It defines the recommended visual language, layout, typography, reusable components, key screens, interaction states, responsive behavior, accessibility considerations, and unresolved decisions.

**This is a proposed design specification, not a claim that the referenced products use every token or interaction described here.** Observations about the references are separated from recommendations for EnvShare. The design should take inspiration from their visual principles without copying logos, proprietary copy, or branded assets.

## 2. Product context

EnvShare is a team-oriented web application for managing environment variables across projects and environments. Its core capabilities are:

- User sign-up and login.
- Project creation and team-member access.
- Multiple environments per project, such as Development, Staging, and Production.
- Standard and Sensitive variables.
- Encryption of sensitive values in database storage, masked display, and authorized reveal.
- Bulk `.env` paste/import with a preview of new, changed, and unchanged keys.
- Change history showing who changed what and when.

The interface must prioritize trust, scanability, safe handling of secrets, and efficient repeated operations. Decorative design should never make a sensitive action, environment context, or data change ambiguous.

## 3. Reference analysis

### 3.1 Gumloop — product-forward SaaS presentation

**What the source supports**

The Godly listing describes Gumloop as a collaborative AI agent builder with company-level access controls. It exposes desktop and mobile page captures and identifies hero, call-to-action, and footer sections. A separate design reference describes a concise, left-aligned introduction above a broad product preview, white/black foundations, and multicolor accents.

A third-party design-token extraction reports the following candidate values for the captured Gumloop design:
- Graphite: `#18191B`
- Pink accent: `#FB3E97`
- Blue accent: `#0190FF`
- Near-white: `#FCFCFC`
- Pink secondary accent: `#FC87C0`
- Heading font reported as Gellix; UI/body font reported as Geist Sans
- Compact buttons around 36px high, with 8px button corners and 10px card corners

These values are third-party observations, not an official EnvShare specification. Website versions and captured screens can differ.

**Design principles worth adapting**
- Clear hierarchy between page title, supporting text, and primary action.
- Product UI shown as the main proof of value rather than relying on decoration.
- Mostly neutral surfaces with a small number of deliberate accent colors.
- Tight, efficient controls within larger, well-spaced page sections.
- A coherent visual rhythm across navigation, content, and action areas.

**How EnvShare should use this**
- Use a calm neutral interface for everyday configuration management.
- Keep the selected project and environment visible while users work.
- Use accent colors for statuses and focus, not as decoration on every surface.
- Make bulk-import preview and history the visual center of their respective workflows.

### 3.2 Seto — AI workspace dashboard concept

**What the source supports**

The Dribbble page identifies the work as “AI Workspace Dashboard UI Design ✦ Seto” by Halo UI/UX for HALO LAB. Its published palette lists:
- `#EFEDED`
- `#95999E`
- `#C2B2B2`
- `#CF6E4E`
- `#EA4931`
- `#171718`

The page does not expose a complete written specification for typography, spacing, grid, or component behavior. Those details should not be presented as verified facts about the design.

**Design principles to borrow cautiously**
- A restrained, muted neutral base.
- Strong near-black contrast for primary text and structural elements.
- Warm terracotta/red accents used selectively.
- A dashboard-first mindset where work content takes precedence over marketing decoration.
- Modular grouping for complex information.

**How EnvShare should use this**
- Use warm accent colors only for carefully chosen actions or status communication.
- Prefer aligned rows, clear column labels, and structured panels for variables and history.
- Avoid making sensitive status depend on color alone.
- Do not apply red to routine actions such as saving or navigating; reserve destructive red for destructive actions and serious errors.

### 3.3 Combined direction for EnvShare

| Design dimension | Reference inspiration | EnvShare direction |
|---|---|---|
| Overall mood | Clean SaaS presentation + restrained dashboard | Calm, precise, secure, operational |
| Background | Light neutral foundation | Soft off-white application canvas |
| Primary text | Near-black/graphite | High-contrast graphite |
| Accent | Gumloop's bright accents; Seto's warm accents | One primary interaction accent plus semantic status colors |
| Typography | Modern sans-serif with distinctive headings | Geist Sans or Inter; consistent UI sizing |
| Layout | Product-forward, structured dashboard | Persistent app shell, contextual header, focused work area |
| Cards/panels | Measured framing rather than visual clutter | Light borders, subtle surface differences, limited shadows |
| Density | Compact controls with breathing room | Dense enough for configuration work, never cramped |
| Motion | Not enough source evidence to specify exact reference behavior | Minimal, purposeful, reduced-motion aware |

---

## 4. Design principles

### 4.1 Trust before decoration
Users may work with production credentials and private API tokens. The UI must make the current project, environment, access context, and secret visibility state clear.

### 4.2 Content before chrome
The variable table, import preview, or history timeline should occupy the main visual area. Navigation should be predictable but visually quiet.

### 4.3 One primary action per context
Each screen or dialog should have one visually dominant action, such as **Create project**, **Review import**, or **Save changes**. Secondary actions should not compete with it.

### 4.4 Status must be redundant
Use text labels and icons in addition to color. For example, show “Sensitive” with a lock icon rather than relying on a red or green dot.

### 4.5 Reveal is deliberate
Sensitive values are masked by default. Reveal should be an explicit action with a clear control state. Avoid revealing values merely because a row is selected or a page is opened.

### 4.6 Reusable patterns
Forms, tables, buttons, badges, dialogs, toasts, and empty states should use a shared component system. A consistent design is more important than one-off visual effects.

### 4.7 Errors should be recoverable
Explain what failed, preserve safe user input when possible, and provide a clear next action. Never include secret values in error messages or diagnostic output.

---

## 5. Color system

The values below are **recommended EnvShare tokens**, not copied official tokens from either reference. They combine a neutral foundation with a restrained warm accent. Semantic colors must be checked for contrast before implementation.

### 5.1 Core palette

| Token | Hex | Intended use |
|---|---|---|
| `color-canvas` | `#F7F7F6` | Overall app background |
| `color-surface` | `#FFFFFF` | Main panels, menus, dialogs |
| `color-surface-muted` | `#F0F0EF` | Subtle secondary areas, selected table header |
| `color-border` | `#E2E3E1` | Dividers, input borders, table separators |
| `color-text-primary` | `#171718` | Main text and primary icons |
| `color-text-secondary` | `#62666B` | Supporting text, metadata |
| `color-text-muted` | `#777C82` | Low-priority metadata; verify contrast for small text |
| `color-accent` | `#CF6E4E` | Restrained warm accent for selected emphasis |
| `color-accent-hover` | `#B9573A` | Hover state for accent actions |
| `color-accent-soft` | `#F8EAE5` | Subtle accent background |
| `color-focus` | `#1769AA` | Keyboard focus ring |
| `color-inverse` | `#FFFFFF` | Text on dark primary buttons |

### 5.2 Semantic colors

| Token | Suggested value | Use |
|---|---|---|
| `color-success` | `#237A4B` | Successful save, completed operation |
| `color-success-soft` | `#E8F5EC` | Success background |
| `color-warning` | `#8A5A00` | Potentially risky or incomplete state |
| `color-warning-soft` | `#FFF3D6` | Warning background |
| `color-danger` | `#B42318` | Delete, access denied, serious failure |
| `color-danger-soft` | `#FDECEA` | Error background |
| `color-info` | `#245EA8` | Informational notices |
| `color-info-soft` | `#EAF2FC` | Informational background |

Semantic values are starting points, not certified accessible combinations. Validate text and non-text contrast in the implemented UI.

### 5.3 Import preview colors

Import preview needs three distinct states:

- **New:** green icon and “New” label.
- **Update:** amber icon and “Update” label.
- **Unchanged:** neutral grey icon and “Unchanged” label.

Do not use the accent red/orange as the only difference between states. Each state must have a visible label and be understandable without color perception.

### 5.4 Color usage rules

- Keep most of the interface neutral.
- Use the warm accent sparingly; do not color every primary button with it.
- Use a dark graphite primary button for the main action by default.
- Reserve danger red for destructive actions and serious errors.
- Avoid gradients as a default surface treatment.
- Do not use color alone to communicate environment, secret status, import outcome, or validation errors.
- Confirm WCAG contrast for text, icons, borders, focus states, and controls.

---

## 6. Typography

### 6.1 Recommended typefaces

**Preferred:** Geist Sans, if available and licensed for the project.  
**Fallback:** Inter, followed by the platform sans-serif stack.

Suggested CSS stack:

```css
font-family: "Geist Sans", Inter, ui-sans-serif, system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Use one primary family across the application. A monospace font can be used for variable keys and values where it improves readability.

### 6.2 Type scale

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `type-page-title` | 28px / 36px | 600 | Main page heading |
| `type-section-title` | 20px / 28px | 600 | Section heading |
| `type-card-title` | 16px / 24px | 600 | Panel or dialog title |
| `type-body` | 14px / 21px | 400 | Default UI text |
| `type-body-strong` | 14px / 21px | 600 | Emphasis, table values |
| `type-label` | 13px / 18px | 500 | Field labels, table headers |
| `type-caption` | 12px / 16px | 400 | Timestamps, secondary metadata |
| `type-code` | 13px / 20px | 400 | Variable keys and code-like values |

### 6.3 Typography rules

- Use sentence case for page titles, buttons, menu items, and labels.
- Keep headings concise and descriptive.
- Avoid all-caps labels except for rare compact metadata.
- Use tabular numerals for counts and timestamps where useful.
- Use monospace only for code-like content, not for all application text.
- Do not use font size alone to signal secret sensitivity.
- Support browser zoom and longer translated strings without clipping.

---

## 7. Layout and spacing

### 7.1 Application shell

Recommended desktop structure:

1. **Left sidebar:** workspace identity, project navigation, environment context, and settings.
2. **Top header:** current page or breadcrumb, project/environment context where relevant, and user menu.
3. **Main content:** page title, short contextual description, primary action, and the page's main work surface.
4. **Optional contextual panel:** only where it helps a workflow, such as import details or history filters.

The shell should not be so wide that table scanning becomes difficult. The variable workspace should have room for keys, values, type, and actions while preserving legibility.

### 7.2 Suggested desktop dimensions

These are starting recommendations to validate in a prototype:

- Sidebar: 232–256px expanded; compact mode only if necessary.
- Main content horizontal padding: 32px at wide desktop; 20–24px at medium widths.
- Header height: 60–64px.
- Page section gap: 24–32px.
- Standard form width: 480–640px for focused forms.
- Dialog width: 480–640px depending on task.
- Import review: use the available main content width because old/new values need comparison.
- Table row height: 48–56px depending on wrapping and controls.

### 7.3 Spacing scale

Use a consistent 4px-based scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

Use smaller gaps within a control group and larger gaps between sections. Avoid arbitrary one-off spacing values unless a tested layout requires them.

### 7.4 Grid and alignment

- Align page titles, descriptions, and main content to a common left edge.
- Use consistent table column alignment.
- Align form labels and inputs consistently.
- Keep actions in a predictable location at the end of a row or in a clearly defined toolbar.
- Use dividers and surface contrast sparingly; do not place every piece of information inside a separate card.

### 7.5 Surface and elevation

- Default page canvas: `color-canvas`.
- Primary work surface: white.
- Borders: thin, neutral, and consistent.
- Shadows: subtle and rare, mainly for floating menus and dialogs.
- Avoid nested cards inside cards unless there is a strong information hierarchy reason.

---

## 8. Component style specification

### 8.1 Buttons

**Primary button**
- Dark graphite background, white label.
- 8px corner radius.
- 36–40px desktop height; larger touch targets on compact/mobile layouts.
- Medium or semibold label.
- Clear hover, focus, active, disabled, and loading states.

**Secondary button**
- White or muted neutral background.
- Thin border.
- Graphite label.
- Used for Cancel, Back, or other secondary actions.

**Tertiary/text button**
- No prominent filled background.
- Used for low-priority actions such as View history or Learn more.

**Danger button**
- Red styling only for destructive actions.
- Use a confirmation step for high-impact deletions.
- The destructive action must be named clearly, not simply “OK.”

Do not display multiple equally prominent primary buttons in the same action group.

### 8.2 Inputs

- Labels remain visible above fields; placeholders are examples, not substitutes for labels.
- Use a neutral border at rest and a clearly visible focus ring.
- Display validation text directly below the relevant field.
- Preserve entered non-secret text after a validation error where safe.
- For secret inputs, use masked content and an explicit reveal control when permitted.
- Do not put actual API keys or passwords in placeholder examples.

### 8.3 Navigation

- Use text labels alongside icons for primary destinations.
- Current location has a clear selected state using background, weight, or a leading marker.
- Avoid relying on icon-only navigation for unfamiliar actions.
- Project and environment context must remain visible during variable editing and import review.
- Workspace settings and personal account settings should be distinguishable.

### 8.4 Tables and variable rows

Recommended variable columns:

1. Key
2. Value
3. Type
4. Last updated / metadata, if useful
5. Row actions

Guidelines:
- Use monospace for keys and code-like values.
- Sensitive values display a masked placeholder, not their ciphertext.
- Keep reveal, copy, edit, and delete controls discoverable but visually restrained.
- Use explicit accessible labels for icon buttons.
- Avoid showing full secret values in tooltips, hover previews, or notifications.
- Long keys should wrap or truncate with a way to inspect the key safely.
- Define sorting and filtering behavior before adding controls for them.

### 8.5 Status badges

Use compact badges for:
- Development, Staging, Production.
- Standard and Sensitive.
- New, Update, Unchanged.
- Success or failure where relevant.

Badges should be secondary to the actual content. Keep label wording consistent throughout the application. Environment colors must not be the only indication of environment identity.

### 8.6 Dialogs and confirmation

Use dialogs for focused tasks that require a decision, such as deleting a variable or confirming an import.

Dialog requirements:
- Descriptive title.
- Short explanation of consequences.
- Clear primary and secondary actions.
- Keyboard focus stays within the dialog while open.
- Escape closes only when safe and consistent with the task.
- Destructive confirmation names the object being deleted.
- Do not show secret values in confirmation copy.

Avoid using dialogs for long, multi-stage workflows when a dedicated page would be clearer.

### 8.7 Toasts and inline feedback

- Success toast: confirm the action, e.g. “Variables saved.”
- Error: explain the failure and next step where possible.
- Validation: show near the relevant field or row.
- Do not include secrets or sensitive values in toast messages.
- Important import conflicts should remain visible in the review screen rather than disappearing in a toast.

### 8.8 Icons

Use one consistent line-icon family. Icons should clarify actions, not replace labels where meaning is not obvious. Use consistent stroke weight and size. Ensure icon-only controls have accessible names and adequate hit areas.

### 8.9 Menus and popovers

Use for secondary actions such as rename, duplicate, or project settings when those actions are actually supported. Menus must support keyboard navigation, dismissal, and correct focus return.

---

## 9. Information architecture and key screens

The screen list below is a recommended structure derived from the product requirements. It does not assume unconfirmed enterprise features.

### 9.1 Authentication

**Screens**
- Sign up
- Log in

**Content**
- EnvShare identity.
- Email and password fields.
- Primary submit action.
- Validation and authentication errors.

**UX requirements**
- Simple, focused form.
- Clear password handling and error feedback.
- No protected project information before authentication.
- Password reset is not specified in the project brief and remains a product decision.

### 9.2 Projects dashboard

**Purpose:** Let an authenticated user find and create projects they can access.

**Layout**
- Page title: “Projects”.
- Primary action: “Create project”.
- Project list or table with project name and available basic metadata.
- Empty state explaining how to create the first project.

Project owner, member count, last activity, search, and sorting may be useful but should be confirmed before treating them as required fields.

### 9.3 Create project

**Fields**
- Project name.
- Any additional fields only if confirmed by product requirements.

**States**
- Default.
- Validation error.
- Saving.
- Success.
- Server error.

After creation, take the user to the new project workspace or project detail page.

### 9.4 Project workspace / environment selector

**Purpose:** Establish the current project and environment context.

**Recommended structure**
- Breadcrumb or project title.
- Environment selector.
- Variables section.
- Primary actions for adding a variable and importing `.env` content.
- Link or tab for change history.

The currently selected environment must be visually and textually explicit, particularly before editing or importing values.

### 9.5 Variables workspace

**Primary tasks**
- Inspect variable keys and types.
- Add, edit, delete, or copy a value.
- Reveal a sensitive value when authorized.
- Start a bulk import.
- Open change history.

**Recommended layout**
- Page heading with project and environment context.
- Compact toolbar with search/filter only if implemented.
- Variable table as the primary work surface.
- Empty state when no variables exist.
- Clear separation between row actions and global actions.

**Do not assume**
- Bulk export, automatic syncing, environment promotion, or secret rotation are in MVP unless later confirmed.

### 9.6 Add/edit variable

**Fields**
- Key.
- Value.
- Classification: Standard or Sensitive.

**Behavior**
- Explain duplicate-key errors clearly.
- Mask sensitive values after save and on subsequent views.
- On classification change, communicate the security consequence without exposing the value.
- Ask for confirmation when a change is destructive or irreversible.

Whether users can edit a secret without revealing its existing value should be designed as a separate safe flow; it must not require displaying the old secret.

### 9.7 Bulk `.env` import

This is a key EnvShare workflow and deserves more attention than a generic upload dialog.

**Step 1 — Paste**
- Large multiline text area.
- Short instruction and small example using fake values only.
- Cancel and continue/review actions.

**Step 2 — Parse and validate**
- Parse lines.
- Ignore blank lines and lines beginning with `#`, as specified in the brief.
- Identify malformed lines and duplicate keys according to rules that must be decided.
- Do not save changes yet.

**Step 3 — Preview**
- Show counts for New, Update, and Unchanged.
- Show each key and its outcome.
- For changed entries, show old vs. incoming value only when safe and authorized. Mask sensitive existing values.
- Make unchanged entries clearly identifiable.
- Highlight errors and conflicts before the user applies changes.

**Step 4 — Apply**
- Explicit action such as “Apply import”.
- Show progress while saving.
- Report success and any failures accurately.
- Do not report success before the backend confirms the operation.

**Important unresolved parsing rules**
- Duplicate keys in the pasted text.
- Quoted values and escaping.
- Values containing `=`.
- Multiline values.
- Empty values.
- `export KEY=value` syntax.
- Malformed lines and partial-import policy.
- Maximum paste size.

The UI should not imply support for syntax that the parser does not implement.

### 9.8 Change history

**Purpose:** Make changes traceable.

**Recommended content**
- Timestamp.
- Actor.
- Variable key.
- Action type: added, changed, deleted.
- Environment context.
- Safe before/after details where authorized and appropriate.

**Safety rules**
- Never store or render raw secrets in audit descriptions by default.
- Prefer metadata or masked representations for sensitive values.
- Define whether history is append-only and whether restore is supported; rollback is not confirmed in the brief.
- Make it possible to distinguish a deleted variable from a currently existing one.

### 9.9 Team access

The brief states that a project creator can add registered users who can view and edit variables.

**MVP UI**
- List current project members.
- Add a registered user.
- Display success and failure feedback.

**TBD**
- How a user is identified.
- Member removal.
- Ownership transfer.
- Multiple roles or read-only access.
- Organization and workspace membership model.

Do not create a complex role-management UI until these decisions are made.

---

## 10. Interaction and state design

Every interactive element must have a defined behavior. The following states should be designed for relevant screens and components.

### 10.1 Loading
- Use a local spinner or skeleton only where it helps preserve layout.
- Disable duplicate submissions while a request is pending.
- Keep the current project/environment context visible.
- Avoid indefinite loading without recovery guidance.

### 10.2 Empty
- Explain what is absent.
- Offer one relevant next action if the user has permission.
- Example: “No variables in this environment yet” with “Add variable” and “Import `.env`”.
- Do not present empty state copy as proof that an operation succeeded.

### 10.3 Error
- Explain what failed in plain language.
- Preserve safe form input where possible.
- Offer retry or correction when meaningful.
- Never show stack traces, database errors, encryption material, or secret values to users.

### 10.4 Success
- Confirm the completed operation.
- Refresh affected data.
- Use a toast for routine success; use persistent feedback for important multi-step operations such as imports.

### 10.5 Disabled
- Disabled controls need a reason when the reason is not obvious.
- Do not use disabled styling as the only explanation for missing permissions.
- A permission failure should be handled on the server even if the UI hides or disables the action.

### 10.6 Long content
- Long keys and values must not break table layout.
- Use wrapping, truncation, or a deliberate detail view.
- Avoid exposing secret content through hover-only tooltips.
- Ensure dialogs and preview tables remain usable at smaller viewport sizes.

---

## 11. UX requirements for security-sensitive interactions

Security is part of the user experience, not just backend implementation.

### 11.1 Sensitive value display
- Mask by default.
- Reveal only after an explicit user action and authorization check.
- Make the reveal state visually obvious.
- Define whether revealed values are hidden again after navigation, timeout, or focus loss; this behavior remains TBD.
- Never put a secret in a URL, analytics event, browser console, or toast.

### 11.2 Copying values
Copy functionality is not explicitly specified as a required feature, though the brief mentions obvious copy actions as a usability example. If implemented:
- Require explicit action.
- Provide a brief confirmation without displaying the copied value.
- Never log the value in client or server diagnostics.
- Decide whether copying sensitive values needs extra confirmation or audit logging.

### 11.3 Environment context
- Display the current environment in the page heading or persistent context area.
- Use text labels such as “Production”, not color alone.
- Before bulk import or destructive changes, show the target project and environment in the review/confirmation UI.

### 11.4 Authorization
- The server must authorize every protected operation.
- Hiding a button is not an authorization mechanism.
- Unauthorized requests should not reveal whether a secret exists or return its contents.
- Permission errors should be clear without exposing sensitive implementation details.

### 11.5 Audit history
- Record the actor, action, target variable, and timestamp as required.
- Avoid storing raw secret values in general-purpose history descriptions.
- Decide how to protect audit records against unauthorized modification.
- Ensure failed or partially completed updates cannot silently leave history inconsistent with current data.

---

## 12. Responsive behavior

The product is primarily a data-management workspace, so responsive behavior should preserve task completion rather than simply shrink the desktop layout.

### Desktop — 1440px
- Expanded sidebar.
- Full variable table.
- Import preview can compare old and new values side by side.
- Page-level actions remain visible.

### Tablet — 768px
- Sidebar may collapse or become a drawer.
- Reduce page gutters.
- Keep project/environment context visible.
- Allow import comparison to stack or scroll within a bounded region.
- Avoid shrinking important values to unreadable sizes.

### Mobile — 375px
- Use a compact header and drawer navigation.
- Prefer variable rows that open a focused detail/edit view rather than forcing a wide desktop table.
- Stack old/new import values vertically.
- Keep primary actions reachable and controls comfortably tappable.
- Do not allow the whole page to overflow horizontally; a table may use its own deliberate horizontal scrolling if necessary.

### Responsive acceptance criteria
- No unintended horizontal page overflow at 375px, 768px, and 1440px.
- Primary tasks remain possible on narrow screens.
- Text and controls do not overlap.
- Dialogs fit the viewport and remain scrollable.
- Touch targets should generally be at least 44×44 CSS pixels where practical.

---

## 13. Accessibility

Target WCAG 2.2 AA as a design goal, subject to implementation and testing.

- Use semantic headings, landmarks, buttons, forms, and table markup.
- Every input has a persistent programmatic label.
- All functions are keyboard accessible.
- Focus is visible and not obscured.
- Dialog focus is managed correctly and returned to the invoking control.
- Text contrast meets applicable requirements.
- Color is not the sole carrier of meaning.
- Error messages are associated with the relevant field and announced appropriately.
- Icon-only buttons have accessible names.
- Support browser zoom and responsive reflow.
- Respect `prefers-reduced-motion`.
- Do not use animation as the only signal that an operation completed.
- Ensure secret reveal controls work with keyboard and assistive technology.

---

## 14. Motion and micro-interactions

The references do not provide enough verified evidence to specify their exact motion system. For EnvShare, use minimal functional motion:

- Short hover and focus transitions.
- Subtle menu and dialog entrance/exit.
- Clear loading feedback for save and import operations.
- No decorative animated backgrounds in the core workspace.
- No animation that delays access to important controls.
- Respect reduced-motion preferences.

Motion should reinforce state changes, not distract from configuration work.

---

## 15. Design tokens — implementation starter

The following CSS variables are a starting point for implementation and should be validated against the chosen component library.

```css
:root {
  /* Surfaces */
  --color-canvas: #F7F7F6;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F0F0EF;

  /* Text and borders */
  --color-text-primary: #171718;
  --color-text-secondary: #62666B;
  --color-text-muted: #777C82;
  --color-border: #E2E3E1;

  /* Brand interaction */
  --color-accent: #CF6E4E;
  --color-accent-hover: #B9573A;
  --color-accent-soft: #F8EAE5;
  --color-focus: #1769AA;
  --color-inverse: #FFFFFF;

  /* Semantic */
  --color-success: #237A4B;
  --color-success-soft: #E8F5EC;
  --color-warning: #8A5A00;
  --color-warning-soft: #FFF3D6;
  --color-danger: #B42318;
  --color-danger-soft: #FDECEA;
  --color-info: #245EA8;
  --color-info-soft: #EAF2FC;

  /* Typography */
  --font-sans: "Geist Sans", Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", "SFMono-Regular", Consolas, monospace;

  /* Radius */
  --radius-sm: 6px;
  --radius-control: 8px;
  --radius-panel: 10px;
  --radius-dialog: 12px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Focus */
  --focus-ring: 0 0 0 3px rgba(23, 105, 170, 0.25);
}
```

Do not treat these values as final until contrast, keyboard focus, and component states have been tested in a working prototype.

---

## 16. UX acceptance checklist

### Visual consistency
- [ ] Shared color, typography, spacing, radius, and elevation tokens are implemented.
- [ ] Buttons, inputs, menus, badges, and dialogs use consistent component patterns.
- [ ] The primary action is visually clear in each context.
- [ ] Surfaces and shadows remain restrained.

### Product clarity
- [ ] Current project and environment are visible during variable operations.
- [ ] Standard and Sensitive classifications are explicit.
- [ ] Sensitive values are masked by default.
- [ ] Import review clearly separates New, Update, and Unchanged.
- [ ] Change history identifies actor, action, and time.

### Interaction states
- [ ] Loading, empty, error, success, disabled, and long-content states are designed.
- [ ] Duplicate submission is prevented during pending operations.
- [ ] Destructive actions clearly identify the target.
- [ ] Every visible control has a defined behavior.

### Security
- [ ] Server-side authorization protects every sensitive operation.
- [ ] Secret values do not appear in URLs, logs, toasts, or error messages.
- [ ] Import preview avoids accidental disclosure of existing sensitive values.
- [ ] Failed operations do not produce misleading success feedback.

### Responsive and accessible behavior
- [ ] Layout is checked at 375px, 768px, and 1440px.
- [ ] No unintended horizontal page overflow exists.
- [ ] Keyboard focus is visible and managed correctly.
- [ ] Text and controls meet contrast and labeling requirements.
- [ ] Reduced-motion preferences are respected.

---

## 17. Open design and product decisions

These questions cannot be settled by the visual references alone.

1. **Organization model:** Does EnvShare have explicit organization/workspace entities, or are projects owned directly by users?
2. **Permissions:** Can every project member edit variables and reveal every secret, or are separate roles required?
3. **Project navigation:** How should users switch between many projects and environments?
4. **Secret reveal:** Should reveal require re-authentication, expire automatically, or be audited?
5. **Copy behavior:** Is copying sensitive values an MVP feature, and does it need additional controls?
6. **Import syntax:** Which `.env` syntax variants must be supported?
7. **History:** Is history read-only, or must users restore a prior state?
8. **Mobile:** Is mobile a supported full workflow or a responsive companion experience?
9. **Theme:** Is dark mode required? It is not established by the project brief.
10. **Branding:** Is the warm terracotta accent approved, or should EnvShare use a cooler blue accent for a more conventional security-tool feel?

Keep these decisions marked as unresolved until product direction confirms them.

## 18. Final recommendation

Use a **light, neutral, product-first dashboard** as the default EnvShare interface. Borrow Gumloop's disciplined hierarchy and restrained accent usage, and borrow Seto's muted, high-contrast dashboard sensibility without treating its palette or component details as verified design rules.

Prioritize:
1. Persistent project and environment context.
2. A clear, efficient variables workspace.
3. Safe sensitive-value reveal and copy behavior.
4. A robust bulk-import review flow.
5. A readable, trustworthy audit history.
6. Consistent responsive and accessible components.

The result should feel professional and precise, with enough visual character to be recognizable but no decoration that competes with secure configuration management.
