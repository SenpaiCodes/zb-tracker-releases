# Z&B Tracker — project context

A futures trading journal, shipped as a Windows desktop app (Electron). Designed
in Claude Design first — the prototype and its conversation are preserved in
`project/` and `chats/`. Read `README.md` first.

This file is context for whoever picks the project up next.

## Who this is for

The owner is a futures trader (MES / MNQ, ES / NQ), not a developer. Prefer plain
explanations over jargon, and when something needs a terminal, give the exact
commands rather than describing them.

## Shape of the thing

Electron + Vite + React + TypeScript. **No server, no database, no accounts, no
network.** The journal is one JSON file and a folder of JPEGs under
`app.getPath("userData")`.

```
electron/main.js     window, custom protocol, IPC handlers
electron/preload.js  contextBridge — the only surface the page can reach
electron/store.js    all persistence
src/App.tsx          launcher → the four views
src/lib/ocr.ts       screenshot reader (runs in the renderer)
src/lib/store.ts     renderer-side wrapper over the bridge
```

## Conventions worth keeping

- **Styling is inline, on purpose.** The design was authored as inline styles and
  they were carried over close to verbatim so the two can be compared side by
  side. Shared values live in `src/components/ui.ts`; only what inline styles
  cannot express (hover, focus, placeholders, keyframes) is in `src/styles.css`,
  applied by class (`hov-*`).
- **The renderer is served over `app://`, not `file://`.** This is load-bearing:
  a `file://` page is an opaque origin where Web Workers are blocked, and the
  screenshot reader needs one. `registerSchemesAsPrivileged` marks the scheme
  standard + secure so the page behaves like a normal https origin.
- **Tesseract needs fully-qualified asset URLs.** It pulls its own scripts in
  with `importScripts`, which rejects a bare `/tessdata/...` under a custom
  scheme. `getWorker()` builds absolute URLs from `document.baseURI`; don't
  "simplify" those back to root-relative paths.
- **Every store call returns a whole snapshot**, and the UI replaces state with
  it. Two writes in flight can therefore apply out of order, so all of them go
  through `commit()` in `src/App.tsx`, which stamps each call and drops
  superseded replies. Route new mutations through it too.
- **Screenshots are files, referenced as `app://shot/<file>`.** `store.shotPath()`
  refuses anything that escapes the shots folder; keep that check.
- **Screenshots are stored exactly as taken.** `readShot()` writes the original
  bytes — no resample, no re-encode, original format — because these are charts
  people zoom into to re-read a wick. They were once run through a 1500px / 72%
  JPEG `shrink()`, which is fine for a thumbnail and useless full-screen; that
  function survives only as a safety valve past 24MB. `Lightbox` shows a real
  `<img>` with a 1:1 zoom rather than a capped background-image, and OCR reads
  the original `File` either way, so accuracy never depended on this.
- **Re-saving a date** replaces that day's numbers and trades but *appends*
  screenshots, so an earlier upload is never silently dropped.
- **Two bundled typefaces, deliberately.** Outfit carries the interface
  (geometric, round bowls, holds up at bold); JetBrains Mono carries every
  number, so columns of figures align. Don't put prose in the mono or figures in
  the sans.
- **Nav icons are hand-drawn SVG** in `components/Icon.tsx` — four shapes on a 24
  grid at 1.75 stroke, inheriting `currentColor` so they track the theme. Adding
  an icon package for this would be the wrong trade.
- **Fonts and the OCR model are bundled**, not fetched. The app must work with no
  internet at all. Don't reintroduce a CDN link.
- **A flat day is not a losing day, and flat is a band.** Fees alone can leave a
  scratched session a few dollars down, so the user sets a breakeven tolerance in
  Settings → Journal and it is stored as `journal.breakevenBand`. Classify with
  `dayKind(net, band)` from `lib/account.ts` — never `net > 0 : net < 0`. A flat
  day uses the neutral `--flat*` tokens and counts in neither tally. Every view
  that colours or counts a day takes the band as a prop; if you add one, thread
  it through too.
- **The window is frameless and all three buttons are ours.**
  `components/WindowControls.tsx` draws minimise / maximise / close and calls
  `app:minimize` / `app:toggleMaximize` / `app:close`. The native overlay was
  dropped because it accepts only two colours and looked washed out on the light
  themes. Dragging and Aero Snap still work through `-webkit-app-region: drag` on
  the header, so every control inside it needs `no-drag`. Main pushes
  `app:maximized` on maximise/unmaximise so the glyph tracks changes Windows
  makes itself.
- **Colour is a CSS variable, never a hex.** `components/ui.ts` maps every token
  to `var(--…)`, and `styles.css` derives all of them from five seeds with
  `color-mix`. That is what makes the light preset work without a second
  palette: mixing the surface toward the foreground lightens a dark theme and
  darkens a light one. Don't reintroduce literal hexes in components.
- **The equity chart follows the dataviz rules**: one series so no legend, solid
  hairline grid, only the endpoint direct-labelled, crosshair + tooltip with
  keyboard equivalents. Green/red is a *status* encoding, so the header always
  prints the signed figure and an arrow — never colour alone. The calendar below
  is the chart's table view.
- **Only the main column scrolls.** The shell's body is `overflow: hidden` and
  `<main>` owns the scrollbar, so the sidebar is a fixed rail rather than
  something that rides up with the content. `position: sticky` was tried and
  doesn't hold when the whole flex row is the scroller.
- **A keyframe that sets `transform` clobbers an inline one.** The title-bar
  menus are centred with `translateX(-50%)`, so their entrance uses `menuIn`,
  which carries the centring through both keyframes. Reusing `riseIn` there
  silently knocked them off-centre once the animation finished.
- **Layout fills the window.** The main column is centred with a generous cap,
  and grids use `auto-fit`/`minmax` rather than fixed track counts. Fixed
  max-widths on views are what left the right-hand third of a wide window dead.
- **Preset tags live in the journal file**, seeded from `DEFAULT_TAGS` on first
  run, and are only a quick-pick palette. Deleting one never edits history;
  renaming one deliberately does, so days stay consistent. `NewEntry` also shows
  any tag on the current draft that is no longer in the palette, so an old tag is
  never silently unselectable.
- **Prop-firm rules are derived, never stored.** `lib/propfirms.ts` is a
  catalogue of firm → plan → size templates that *seeds* an account's rules; from
  then on the rules live on the account and are editable, because firms change
  their specs and the templates were compiled from public write-ups rather than
  contracts. Everything downstream — balance, drawdown floor, consistency, and
  whether an evaluation was passed or breached — is recomputed from the logged
  days by `lib/account.ts`, so correcting a day's P&L corrects the status with
  it. `detectPhaseChange()` runs after each save in `App.tsx` and only records
  the outcome via `store.setPhase`.
- **Only a breach is automatic; converting an evaluation is the user's call.**
  `detectPhaseChange()` reports a blown account and nothing else. `evalCleared()`
  returns the date a target was met (consistency included) and merely *offers*
  the upgrade — the sidebar's **Upgrade to funded** button. The phase change is
  applied when `Celebration` finishes, so the balance reset lands with the
  reveal. Don't wire the pass back into the auto-detector: resetting someone's
  balance the instant a number is hit, before their firm has converted it, is
  not the app's decision to make.
- **Passing an evaluation resets the balance, and the eval profit stays behind.**
  `passedOn` splits the account's history: days on or before it are still listed
  everywhere, but the balance, equity curve and drawdown floor all start again
  from `size`. That split is expressed as the `phaseStart` / `phaseFrom` pair
  `App.tsx` hands to `Dashboard` and `Sidebar` — if a new view shows a balance,
  it needs both, or it will double-count.
- **All time is permanent, and that constrains deleting.** Every day ever logged
  has to keep showing up there, so the blown-account button *retires* an account
  (`archived: true`) rather than deleting it: it leaves the switcher, its days
  stay. Only Settings → Closed accounts → "Delete for good" destroys anything,
  and it says so. `normalize()` drops days whose `accountId` no longer resolves,
  which is why a retired account must remain in `accounts`.
- **A date can hold more than one entry.** All time and Current stack span
  several accounts and you can trade the same day on all of them, so the calendar
  keys `Map<date, DayDTO[]>` and a cell shows the date's *total* with a `×n`
  marker; `DayDrawer` takes `days[]` and switches between them. Keying a date to
  a single day is the bug that hid every account but the first.
- **The window icon must live outside the asar.** `extraResources` puts
  `icon.png` beside the executable and `iconPath()` in main resolves it from
  `process.resourcesPath` when packaged. Electron will not reliably read a window
  icon out of `app.asar`, and a failed read silently falls back to its own atom
  logo — which is what shipped. `build/icon.ico` is a real multi-size ICO
  (16→256, each rendered at its own size from the SVG) so the taskbar picks a
  crisp one instead of downscaling a single large PNG.
- **Payouts belong to a phase, not to a date range.** `setPhase` clears an
  account's payouts when the phase resets, so `accountStatus` can sum all of them
  with no date filter. Matching payout dates against `passedOn` meant a payout on
  the pass day — or a clock a day out — vanished, which reads exactly like the
  deduction not working. Don't reintroduce the comparison.
- **Win rate falls back to days.** Most days get logged as a date and a net
  figure with the win/loss boxes empty, so `agg()` counts *days* when no trades
  were recorded and sets `byDay` to say so. A permanent 0% is worse than useless.
- **A payout is money leaving, not a losing day.** `account.payouts` holds what
  the user says they withdrew; `accountStatus` takes it off `balance` and off the
  drawdown `cushion` (the floor follows the trading peak and doesn't move for a
  withdrawal — the firms count it the same way), but never off `phaseNet` or any
  win/loss tally. The equity curve steps down on the payout's date via
  `EquityChart`'s `deductions`. Only funded *prop* accounts can pay out.
- **Payout eligibility is a firm rule, not a guess.** `PayoutRules` on each
  account carries the winning days required, what a day must clear to count, the
  buffer held over the drawdown, the request minimum/maximum and the split —
  seeded per plan in `propfirms.ts`, editable per account like every other rule.
  `accountStatus` turns them into `maxRequest` and `payoutBlockers`, and the
  sidebar shows progress rather than a button that would fail. `maxRequest` is
  the *smallest* of every cap at once, `balance - payoutFloor` included, which is
  what stops a withdrawal leaving an account one red day from blown.
  `detectPhaseChange` walks payouts alongside days for the same reason: money out
  lowers the balance without lowering the floor, so a withdrawal can breach.
- **Payouts date-filter with `>=` the pass date, not `>`.** Passing and
  withdrawing on the same day is ordinary, and `>` silently dropped the payout —
  which looked exactly like the deduction not working.
- **One balance, computed once.** `App.tsx` derives `accountStatus` and hands
  `balance` to the sidebar rather than letting each view re-add the days — three
  components each doing their own sum is how the sidebar came to disagree with
  the title bar after the first payout.
- **"All time" is a view, not a row in the file.** `stats.allTimeAccount()`
  builds it fresh from the journal each render, so it can never fall out of
  date, and `ALL_TIME_ID` never reaches the store. Selecting it is renderer state
  (`virtualId` in `App.tsx`); the stored `activeAccountId` stays put underneath
  and remains where new entries are filed, which is what `NewEntry`'s
  `filedUnder` line tells the user. `Current stack` is the same machinery over
  `liveAccounts()` — everything not blown and not retired.
- **Copy-trading writes real days, not references.** `saveDay`'s `copyTo` gives
  each named account its own copy, because they have their own rules and their
  own drawdown; the screenshot stays with the account it was taken on. A save can
  therefore blow more than one account at once, which is why the breach check in
  `saveDraft` loops over every account it touched.
- **The data folder is pinned** to `%APPDATA%\ZB Tracker`: the product name
  contains an ampersand, and Electron would otherwise put one in the path. An
  explicit `--user-data-dir` still wins, which is what the e2e harness relies on.

## The screenshot reader — read this before touching src/lib/ocr.ts

Four things make it accurate, each arrived at by fixing an actual failure:

1. **Crop and upscale before recognizing.** The toolbar band and the bottom trade
   table are cropped and scaled up separately. A downscaled full frame turns 11px
   toolbar text to mush.
2. **Reduce to the max colour channel, not luminance.** Easy to "clean up" and
   thereby break. Losing P&L is printed in red, and red carries almost no weight
   in a luminance sum — `#f2545b` lands at ~131, mid-grey, and vanishes into the
   background. Every minus sign and every losing number was invisible until this
   changed. Do not switch it back to luminance.
3. **Fuzzy label matching, with one hard-coded distinction.** `RP&L` comes back
   as `nP2l`, `PPAL`, `RPAL`, so labels match by edit distance. The exception:
   realized and *un*realized (`RPAL` / `UPAL`) are one edit apart, and reporting
   open-position P&L as the day's result would be a real error — so that call is
   made on the leading character, which OCR does not confuse. Keep it that way.
4. **Reconcile the two independent readings.** The toolbar total and the sum of
   the trade rows are the same number read twice. On a mismatch, `repairRows()`
   tries the characteristic OCR failures (dropped decimal point, missing minus)
   and takes a combination that reconciles. If nothing reconciles the toolbar
   figure wins — one short token read at high zoom beats a long row with many
   more chances to slip — and the UI says the rows disagree.

`npm test` pins all of this against OCR text captured from real screenshots.
**Run it after any change to `src/lib/ocr.ts`.** The pure parsing half is
exported as `parseRecognizedText()` specifically so it can be tested without a
browser.

Known limitation, accepted: local OCR is good but not a vision model. On the
reference screenshot it misreads one entry-price digit (`29,348.47` for
`29,344.47`). It is cosmetic — P&L is unaffected — but it is why every field is
badged `detected` / `manual` and nothing saves without confirmation. Do not
remove that confirmation step.

## Deliberate departures from the design prototype

Don't "restore" these to match the prototype.

- **No login page.** Replaced by a launcher: a live, scaled-down `<Dashboard>`
  with sample data on the left, **Start app** / **Close** on the right. It renders
  the real component rather than a picture, so it cannot drift out of date.
- **No user accounts, email verification or Google sign-in**, and no panels to
  configure them. There is no server to authenticate against.
- **Trading accounts were kept** — those are a journal feature, not an auth one.

## Building and testing

| Command | What it does |
| --- | --- |
| `npm run dev` | App against the Vite dev server |
| `npm start` | Build the front-end, run the app |
| `npm run dist` | Windows installer into `release/` |
| `npm test` | Parser regression tests |
| `npm run typecheck` | TypeScript, no emit |

`npm run dist` runs natively on Windows. On Linux it additionally needs 32-bit
Wine (`libc6:i386` included) — NSIS uses it to generate the uninstaller; without
it you get a ~200KB stub with no payload rather than a hard failure, so check the
output size.

The app can be driven end to end under `xvfb` with Playwright's `_electron`
launcher, which is how the OCR path was verified inside the packaged shell.

## Installer

One-click NSIS: no wizard, per-user, launches after installing.
`build/installer.nsh` additionally uninstalls the older *Tape & Ledger* release,
which had a different appId and so is invisible to electron-builder's own
upgrade path. Its inclusion is verifiable by putting an `!error` in the file and
watching the build fail.

`win.signExecutable: false` (not `signAndEditExecutable: false`) is deliberate:
the latter also skips rcedit, which is what once left the packaged app wearing
Electron's stock icon. Editing needs Wine on Linux.

`Store.adoptLegacy()` copies a previous version's journal on first run when this
install has none. It copies, never moves, so a bad guess cannot lose data.

## State of things

- Committed on the branch `implement-trading-journal`. No git remote is
  configured and nothing has been pushed.
- Verified end to end in the real Electron app: launcher → start → attach the
  owner's screenshot → analyze (reads `2026-08-30`, `-$88`, 0W/2L, 18 contracts,
  both MNQ rows, reconciled) → save → drawer → lightbox → journal → settings,
  with the journal written to disk and no page errors.
- The installer is unsigned, so SmartScreen warns on first run.
- `npm audit` is clean.
