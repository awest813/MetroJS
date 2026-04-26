# UI Cleanup Notes

> **Scope:** Safe, reversible cosmetic and accessibility improvements only.
> No simulation logic, no game-play behaviour, and no architectural changes
> were made. All changes are in `index.html` and `css/style.css`.

---

## CSS fixes (`css/style.css`)

### 1. `font-weight: 600px` → `font-weight: 600` (`.semibold`)

`px` is not a valid unit for the `font-weight` property.  The browser
silently discarded the entire declaration, meaning `.semibold` elements
rendered at normal weight.  Changed to the bare numeric value `600`.

```diff
-.semibold { font-weight: 600px; }
+.semibold { font-weight: 600; }
```

### 2. `align: center` → `text-align: center` (`#budgetForm > div:nth-child(9)`)

`align` is not a valid CSS property.  The correct property is `text-align`.

```diff
-  align: center;
+  text-align: center;
```

### 3. `text-align: centre` → `text-align: center` (`.info`)

British spelling typo.  `centre` is not a recognised CSS value.

```diff
-.info { text-align: centre; }
+.info { text-align: center; }
```

### 4. Added `:focus-visible` outline for keyboard navigation

When `border: none` is set on buttons, most browsers suppress their default
focus ring for mouse users, but also lose it for keyboard users.  A 3 px
high-contrast blue outline (`#0066cc`) is now shown on all interactive
elements when navigated with the keyboard (`Tab`, `Shift+Tab`, arrow keys).
The rule uses `:focus-visible` so the outline does **not** appear for mouse
clicks — no visual regression for pointer users.

```css
button:focus-visible, input[type="submit"]:focus-visible,
input[type="range"]:focus-visible, input[type="text"]:focus-visible,
select:focus-visible {
  outline: 3px solid #0066cc;
  outline-offset: 2px;
}
```

### 5. Added `.difficultyGroup` helper class

New zero-margin, border-less `fieldset` reset class used in the New Game
form (see HTML changes below).

---

## HTML changes (`index.html`)

### 6. `<nav aria-label="Site navigation">`

Added `aria-label` to the header `<nav>` element so screen-reader users can
distinguish it from any other landmark navigation regions on the page.

### 7. `<div id="infobar" aria-label="City information">`

The HUD panel now has a readable landmark label so assistive technologies
can announce it when it is navigated to.

### 8. `<div id="miscButtons" aria-label="City controls">`

Same pattern as the infobar.

### 9. `title` attributes on all seven city-control buttons

| Button | `title` added |
|---|---|
| Budget | "Open the city budget panel" |
| Evaluation | "View city evaluation and statistics" |
| Disasters | "Trigger a disaster" |
| Save | "Save the current game" |
| Settings | "Adjust game settings" |
| Take Picture | "Take a screenshot of the map" |
| Pause | "Pause or resume the simulation" |

These appear as native browser tooltips on hover and are read by assistive
technologies.

### 10. `<div id="controls" aria-label="Build tools">`

The toolbox panel on the right now has a readable landmark label.

### 11. `title` attributes on all sixteen tool buttons

| Button | `title` added |
|---|---|
| Residential | "Place a residential zone ($100)" |
| Nuclear | "Build a nuclear power plant ($5,000)" |
| Commercial | "Place a commercial zone ($100)" |
| Coal | "Build a coal power plant ($3,000)" |
| Industrial | "Place an industrial zone ($100)" |
| Police | "Build a police station ($500)" |
| Road | "Place a road segment ($10)" |
| Fire | "Build a fire station ($500)" |
| Rail | "Place a rail segment ($20)" |
| Port | "Build a seaport ($3,000)" |
| Wire | "Place a power line ($5)" |
| Stadium | "Build a stadium ($5,000)" |
| Bulldozer | "Bulldoze terrain or structures ($1)" |
| Airport | "Build an airport ($10,000)" |
| Query | "Query tile information" |
| Park | "Place a park ($10)" |

### 12. `<div id="notifications" role="status" aria-live="polite" aria-label="City news">`

The notifications ticker now carries `role="status"` and `aria-live="polite"`
so screen readers automatically announce new messages (fires, disasters,
population milestones, etc.) without requiring the user to navigate to the
element.

### 13. Difficulty radio group wrapped in `<fieldset>` / `<legend>`

The bare text "Difficulty" in the New Game form was not associated with the
three radio buttons below it.  Replaced with a semantic `<fieldset>` and
`<legend>` so screen readers correctly announce the group name when any of
the radio buttons receives focus.

```html
<!-- Before -->
Difficulty
<input type="radio" ... id="difficultyEasy"><label>Easy</label>
...

<!-- After -->
<fieldset class="difficultyGroup">
  <legend>Difficulty</legend>
  <input type="radio" ... id="difficultyEasy"><label>Easy</label>
  ...
</fieldset>
```

The `.difficultyGroup` CSS class removes the default fieldset border and
padding so the visual layout is unchanged.

### 14. `role="dialog"` / `aria-modal="true"` / `aria-labelledby` on all twelve modal dialogs

All modal `<div>` elements now carry these three attributes:

| `id` | `aria-labelledby` points to |
|---|---|
| `budget` | `budgetHeader` |
| `evalWindow` | `evalHeader` |
| `disasterWindow` | `disasterHeader` |
| `queryWindow` | `queryHeader` |
| `congratsWindow` | `congratsHeader` |
| `nagWindow` | `nagHeader` |
| `saveWindow` | `saveHeader` |
| `screenshotLinkWindow` | `screenshotLinkHeader` |
| `screenshotWindow` | `screenshotHeader` |
| `settingsWindow` | `settingsHeader` |
| `debugWindow` | `debugHeader` |
| `touchWarnWindow` | `touchHeader` |

`aria-modal="true"` signals to screen readers that content behind the dialog
is inert while it is open.  `aria-labelledby` causes the dialog's `<header>`
text to be announced as the dialog's accessible name.

---

## What was intentionally NOT changed

- Button heights, font sizes, and all pixel-positioned layout values —
  these are tightly coupled to the stacked absolute-position layout and
  would require cascading coordinate adjustments across multiple media
  queries.
- Simulation code, game logic, tool wiring — zero simulation files touched.
- The jQuery-based event system — all JS files are unchanged.
- The Twitter share widget — kept as-is; a live CDN widget outside the
  game's own scope.
- Any colour choices — kept as-is to preserve the retro aesthetic.
- `disasterFire` HTML option `value` attribute — `DisasterWindow.prototype.open()`
  overrides all option values via JS before the dialog is displayed, so the
  static HTML value is never used at runtime.  Left unchanged to avoid
  any risk of diverging from the JS-authoritative constants.

---

## How to revert

All changes are in two files.  To revert:

```bash
git diff HEAD~1 -- index.html css/style.css
git checkout HEAD~1 -- index.html css/style.css
```
