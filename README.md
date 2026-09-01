# Z&B Tracker

A futures trading journal that runs as a Windows desktop app. Drop the daily P&L
panel from your platform, let the app read the numbers off it, confirm them, and
write down what actually happened. The month grid tells you the rest.

There is no account, no login and no server. Everything lives on your computer,
and the app works with no internet connection at all.

Built from the Claude Design handoff in [`project/`](project/) — see
[Relationship to the design bundle](#relationship-to-the-design-bundle).

## Installing

Download the latest `ZB-Tracker-Setup-<version>.exe` from
[Releases](../../releases/latest) and run it. Windows will warn that the publisher is
unknown, because the installer isn't code-signed — **More info → Run anyway**.
Signing it requires buying a certificate; see [Code signing](#code-signing).

From there it is hands-off: one click installs per-user (no admin rights),
makes a desktop and Start menu shortcut, and launches the app. Any previous
version is removed first, including the older *Tape & Ledger* release, which
shipped under a different identity.

**Your journal is never touched by any of that.** It lives in `%APPDATA%`, not
the install folder, so upgrading and uninstalling both leave it alone. On first
run a new install also adopts the journal from a previous version's folder if it
finds one, copying rather than moving it.

## Using it

Opening the app shows a preview of the journal with **Start app** and **Close**.
Start it, and you're straight in — no sign-in.

**New entry → drop a screenshot → Analyze screenshot.** It reads the date, net
P&L, wins/losses, contracts and the individual closed trades. Confirm the
numbers, add a note and tags, and save. Clicking any day on the dashboard opens
its notes, trades and screenshots.

### Accounts and prop firms

You can keep as many **trading accounts** as you like under Settings → Accounts.
Choose a prop firm — Topstep, Lucid or Tradeify — then the plan you bought and
the account size, and the profit target, drawdown, daily loss limit and
consistency rule are filled in for you.

From there the app keeps track of the account on its own. The dashboard grows a
panel showing how far the evaluation has got, how much room is left before the
drawdown floor, and, when your plan has one, what share of your profit came from
your best day against the limit. Clear the target and the account resets to its
starting balance and shows as **Funded**; breach the floor and it is marked
**Blown**, dated to the day it happened. All of it is worked out from your logged
days, so correcting a day's P&L corrects the status with it.

> The firm templates are a **starting point, not gospel**. They were compiled
> from public write-ups rather than each firm's contract, and firms change their
> specs often. Every field stays editable per account — check them against your
> own dashboard before you rely on a number here.

**All time** is a permanent entry in the account switcher covering every account
you have ever had: days, screenshots, notes, win rate, the lot. It is a view
rather than an account, so it needs no upkeep — new entries still go to whichever
account is set active, and the entry form says which that is.

The title bar carries the switcher: click the account name to change accounts,
or the balance beside it for today, this week, this month and all-time figures
for whatever is selected.

The dashboard opens on an **equity curve** for the month on view — hover it for
any day's balance and that day's P&L, or focus it and use the arrow keys. The
line runs green when the month is up and red when it's down, and the figure and
arrow beside it say which, so it never depends on colour alone.

The sidebar carries the nav, whichever trading accounts you keep, your recent
sessions (click one to open that day) and the running balance.

### Settings

Settings is split into four sections down the left: **Appearance**, **Accounts**,
**Journal** and **Your data**.

**Breakeven** (Settings → Journal) is a band, not a point. Commissions alone can
leave a scratched session $12 down, and that is not a losing day — set the
tolerance and anything within it shows grey rather than red everywhere: the
calendar, the equity curve, the journal list and the sidebar. Flat days count in
neither the wins nor the losses.

**Themes** live in Settings → Appearance: fourteen presets — ten dark, four
light including a warm **Crème** — plus a custom theme where you pick the
background, text, profit, loss and accent colours. Everything else — panels, borders, the tiers of muted text — is mixed
from those five, so a light background works as well as a dark one.

**Tags** are yours to define. Settings → Journal starts with eight common ones and
lets you add, rename and remove any of them; the list is the quick-pick palette
on a new entry. Renaming a tag updates every day already using it. Removing one
only takes it off the palette — days already tagged with it keep it, and the tag
still shows on the entry form when that day is open.

### Where your data lives

`%APPDATA%\ZB Tracker` — a `journal.json` file plus a `shots` folder.
Settings → **Show data folder** opens it. Uninstalling does *not* delete it.

Back it up now and then with Settings → **Back up to a file**: that single file
contains every entry, trade and screenshot, and **Restore from a file** reads it
back on any machine.

## Building it yourself

```bash
npm install        # also fetches the OCR model (~2MB)
npm run dev        # the app, with hot reload
npm run dist       # build the installer into release/
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app against the Vite dev server |
| `npm start` | Builds the front-end and runs the packaged-style app |
| `npm run dist` | Builds the Windows installer |
| `npm test` | Screenshot-parser regression tests |
| `npm run typecheck` | TypeScript, no emit |

`npm run dist` works natively on Windows. On Linux it additionally needs 32-bit
Wine, which NSIS uses to generate the uninstaller.

### Code signing

Without a certificate, Windows SmartScreen warns on first run. To sign, get an
Authenticode certificate, set `CSC_LINK` and `CSC_KEY_PASSWORD`, and change
`signAndEditExecutable` to `true` in `electron-builder.yml`.

## How the screenshot reader works

This is the part worth explaining, because getting it accurate without a paid
vision API took some doing. It runs
[Tesseract](https://github.com/naptha/tesseract.js) inside the app — free,
keyless, offline, and your screenshots never leave the machine.

Naive OCR on a trading screenshot fails badly. Four things make it work:

**Crop and upscale the regions that matter.** A full screenshot downscaled to
something Tesseract can chew on turns 11px toolbar text into mush. Instead the
top band (where `Bal` / `RP&L` live) and the bottom panel (the closed-trades
table) are each cropped and upscaled before recognition.

**Use the max colour channel, not luminance.** This is the one that matters
most. A losing P&L is printed in red, and red carries almost no weight in a
luminance sum — `#f2545b` reduces to a mid-grey that vanishes against the
background. Every minus sign and every losing number disappeared until the
preprocessor switched to `max(r, g, b)`, which treats red text as brightly as
white.

**Match labels fuzzily, but pin the one distinction that matters.** At toolbar
sizes `RP&L` comes back as `nP2l`, `PPAL`, `RPAL` — so labels are matched by
edit distance rather than exact spelling. The exception is realized versus
*un*realized P&L: `RPAL` and `UPAL` are one edit apart, and reporting
open-position P&L as the day's result would be a real error. That distinction is
decided by the leading character, which OCR doesn't confuse.

**Reconcile the two independent readings.** The toolbar total and the sum of the
trade rows are the same number read twice. When they disagree, the rows are
re-examined against the small set of characteristic OCR failures — a dropped
decimal point, a missing minus — and a reading that reconciles wins. On the
sample screenshot this recovers `-$3150` back to `-$31.50`. When nothing
reconciles, the toolbar figure stands (it is one short token read at high zoom,
where a table row has many more chances to slip) and the UI says the rows
disagree.

Every field is marked `detected` or `manual` in the form, and nothing is saved
until you confirm it. Local OCR is good but not a vision model — treat the
confirm step as load-bearing, especially for prices in small timestamp text.

`npm test` runs the parser against captured OCR output from real screenshots,
including the mangled labels and dropped decimals above.

## Layout

```
electron/
  main.js          window, custom protocol, IPC
  preload.js       the only bridge into the page
  store.js         the entire data layer: one JSON file + a shots folder
src/
  App.tsx          launcher, then the four views
  components/      UI, ported from the design
  lib/ocr.ts       screenshot reader
  lib/propfirms.ts firm / plan / size rule templates
  lib/account.ts   drawdown, consistency, pass and blow detection
  lib/stats.ts     period slicing and the All-time view
tests/             parser regression tests
electron-builder.yml
```

## Relationship to the design bundle

`project/` holds the original Claude Design prototype and `chats/` the
conversation it came from; both are kept for reference. The visual design is
reproduced as specified, with two deliberate changes:

- **The login page is gone.** In its place is a launcher: a live, scaled-down
  preview of the dashboard on the left, **Start app** and **Close** on the
  right. With no server there is nobody to log in to.
- **Email and Google sign-in are gone**, along with the panels that configured
  them. The prototype's Account page is now Settings: trading accounts, storage
  and backup.

Trading accounts were *kept* — those are a journal feature, not an auth one.
