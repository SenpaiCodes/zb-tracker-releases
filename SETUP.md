# Building it yourself

You have the whole project as a folder now. That means you can build the
installer yourself — one file, no splitting, no joining — and have Claude Code
work on it directly.

## 1. Put the folder somewhere sensible

Extract the zip. Somewhere without spaces or OneDrive syncing is easiest:

```
C:\Users\<you>\zb-tracker
```

You should see `package.json`, `src`, `electron` and this file inside it.

## 2. Node.js

You already have it (`C:\Program Files\nodejs`). To check, open **Command
Prompt** — not PowerShell — and run:

```
node -v
```

Anything 20 or higher is fine. If it says it isn't recognised, install the LTS
build from https://nodejs.org and reopen the window.

> **Use Command Prompt, not PowerShell.** PowerShell blocks npm by default and
> gives you `npm.ps1 cannot be loaded because running scripts is disabled`. If
> you'd rather stay in PowerShell, run this once to unblock it:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 3. Install the dependencies (once)

In Command Prompt, from inside the folder:

```
cd C:\Users\<you>\zb-tracker
npm install
```

Takes a couple of minutes. It also downloads the OCR model the screenshot
reader needs, which is why `public\tessdata` isn't in the zip.

## 4. Build the Windows installer

```
npm run dist
```

When it finishes you'll have:

```
release\ZB-Tracker-Setup-2.0.0.exe
```

**That is the single file.** Double-click it: it removes the old version,
installs, keeps your journal, and launches. Rebuild it any time with the same
command — it's much faster after the first run.

To just run the app without installing it:

```
npm start
```

## 5. Building the Mac version

Copy this same folder to the Mac (OneDrive, AirDrop, a USB stick — it is only
3 MB), open **Terminal**, and run the same three commands:

```
cd ~/zb-tracker
npm install
npm run dist -- --mac
```

You will get `release/Z&B Tracker-2.0.0-arm64-mac.zip` on Apple Silicon (M1–M4)
or `...-mac.zip` on Intel. Unzip it and drag **Z&B Tracker** into Applications.

If `npm` isn't found, install Node.js from https://nodejs.org first — the macOS
installer from that page is enough, nothing else is needed.

**The first launch needs one extra step.** The app isn't signed with an Apple
Developer certificate, so macOS refuses to open it on a double-click. Right-click
(or Control-click) the app → **Open** → **Open** on the warning. Once only; after
that it launches normally.

Building on the Mac is better than cross-building it elsewhere: it is the
supported path, and it means the build was produced on the machine it runs on.

## 6. Point Claude Code at the folder

Install Claude Code — see https://code.claude.com/docs for the desktop app and
the CLI. Then open this folder in it and describe what you want changed.

`CLAUDE.md` in this folder is written for exactly that: it tells Claude how the
project fits together and, more importantly, which four decisions in the
screenshot reader are load-bearing and must not be "cleaned up". Leave it in
place.

Useful commands, all from inside the folder:

| Command | What it does |
| --- | --- |
| `npm run dev` | The app with hot reload, for making changes |
| `npm start` | Build the front-end and run the app |
| `npm run dist` | Build the installer into `release\` |
| `npm test` | Screenshot-parser tests — run after touching `src\lib\ocr.ts` |
| `npm run typecheck` | TypeScript check |

## Your existing journal is safe

Your entries live in `%APPDATA%\ZB Tracker`, completely separate from this
folder. Rebuilding, reinstalling and even deleting this folder don't touch them.
Paste `%APPDATA%\ZB Tracker` into File Explorer's address bar to see them, or use
Settings → **Show data folder** in the app.

Back them up now and then with Settings → **Back up to a file** — that one file
holds every entry, trade and screenshot.
