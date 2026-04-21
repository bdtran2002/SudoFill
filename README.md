<p align="center">
  <img src="./assets/icon.png" alt="SudoFill icon" width="160" height="160" />
</p>

<h1 align="center">⚡ SudoFill</h1>

<p align="center">Browser extension for fast disposable sign-up flows.</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="HTML" src="https://img.shields.io/badge/HTML-E34F26?logo=html5&logoColor=white" />
  <img alt="CSS" src="https://img.shields.io/badge/CSS-1572B6?logo=css3&logoColor=white" />
</p>

<p align="center">
  <a href="https://github.com/bdtran2002/SudoFill/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bdtran2002/SudoFill/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/bdtran2002/SudoFill/actions/workflows/actionlint.yml"><img alt="Actionlint" src="https://github.com/bdtran2002/SudoFill/actions/workflows/actionlint.yml/badge.svg" /></a>
  <a href="https://github.com/bdtran2002/SudoFill/actions/workflows/release-please.yml"><img alt="Release-please" src="https://github.com/bdtran2002/SudoFill/actions/workflows/release-please.yml/badge.svg" /></a>
  <a href="https://github.com/bdtran2002/SudoFill/actions/workflows/release.yml"><img alt="Release" src="https://github.com/bdtran2002/SudoFill/actions/workflows/release.yml/badge.svg" /></a>
  <a href="https://github.com/bdtran2002/SudoFill/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/bdtran2002/SudoFill" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-GPLv3-blue.svg" /></a>
</p>

It creates a temporary Mail.tm inbox, autofills common registration fields on supported HTTPS pages, keeps verification emails inside the extension UI, and lets you open detected verification links without bouncing between tabs.

- **Firefox** uses a toolbar popup.
- **Chrome** uses a side panel.
- **Autofill stays local in the browser**; the extension only talks to Mail.tm for mailbox creation and message retrieval.

## Highlights

- Create, refresh, and discard disposable inboxes
- Copy the active mailbox address with one click
- Read incoming verification emails in the extension UI
- Open detected verification links in a new tab
- Autofill common sign-up fields like name, email, date of birth, and address
- Tune autofill defaults from the Options page
- Build and package Firefox and Chrome artifacts from the same codebase

## How it works

1. Open SudoFill in your browser.
2. Create a temporary mailbox.
3. Open the sign-up page you want to fill.
4. Trigger **Autofill** from the extension.
5. Wait for the verification email to arrive.
6. Open the message and click a detected verification link.

The extension polls for mailbox updates, restores mailbox state during a session, and keeps the sign-up flow centered in the extension instead of your real inbox.

## Autofill behavior

SudoFill is aimed at typical sign-up and account-creation forms.

It can fill fields such as:

- email
- first name / last name / full name
- date of birth
- sex or gender when a form asks for it
- business name in some form layouts
- street, city, state, country, and postal code

It uses form labels, placeholders, ARIA text, fieldset context, and nearby text to match fields. It also tries to avoid destructive fills by skipping:

- hidden fields
- read-only inputs
- fields that already contain user-entered values
- unsupported or low-intent flows like non-sign-up pages

## Autofill settings

The Options page lets you tune the generated profile used during autofill.

Current settings include:

- generated address on/off
- preferred US state
- age range
- sex bias for generated profiles

Settings are saved in browser storage so they persist across sessions.

## Limits and caveats

- Temporary inboxes are best for short-lived sign-ups, not long-term accounts.
- Phone/SMS verification is not handled.
- Very custom or multi-step forms may still need manual cleanup.
- Autofill only targets normal `https://` pages.
- HTML-only emails may not render fully in the UI, but detected verification links can still be opened directly.

## Browser experience

| Browser | Primary UI    | Notes                                                                                           |
| ------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Firefox | Toolbar popup | Uses the Firefox mailbox flow and supports self-hosted update metadata via `firefox.config.ts`. |
| Chrome  | Side panel    | Uses the same mailbox UI in a side-panel workflow.                                              |

## Privacy and data handling

- Mailbox creation and email retrieval go through `https://api.mail.tm/*`.
- Temporary mailbox session state is stored in browser session storage.
- Autofill preferences are stored in synced browser storage.
- Page autofill is user-triggered from the extension UI.
- The extension does not execute remote code.
- Verification links found in emails open in a new browser tab.

## Developer setup

SudoFill uses **Bun**, **WXT**, **React**, and **TypeScript**.

### Install dependencies

```bash
bun install
```

### Run in development

Firefox:

```bash
bun run dev
```

Chrome:

```bash
bun run dev:chrome
```

### Quick local dev test

```bash
bun run dev:test
```

Runs a fast local sanity check without Docker: typecheck, unit tests, and a Firefox build.

### Build production bundles

Firefox:

```bash
bun run build
```

Chrome:

```bash
bun run build:chrome
```

### Package browser bundles

```bash
bun run zip:firefox
bun run zip:chrome
```

### Quality checks

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run release:check
bun run firefox-addon:check
```

### Useful scripts

- `bun run dev`
- `bun run dev:firefox`
- `bun run dev:chrome`
- `bun run build`
- `bun run build:firefox`
- `bun run build:chrome`
- `bun run zip`
- `bun run zip:firefox`
- `bun run zip:chrome`
- `bun run lint`
- `bun run format`
- `bun run format:check`
- `bun run typecheck`
- `bun run test`
- `bun run test:watch`
- `bun run release:check`
- `bun run release:check:artifacts`
- `bun run firefox-addon:check`
- `bun run firefox-addon:sync`

## Firefox review and self-distribution

The committed `firefox-addon/` directory is a checked-in Firefox review snapshot. Refresh it with:

```bash
bun run firefox-addon:sync
```

For self-distributed Firefox releases:

1. Set a stable `gecko.id` in `firefox.config.ts`.
2. Optionally set `gecko.update_url` if you host Firefox update metadata yourself.
3. Run the verification commands.
4. Build the Firefox package with `bun run zip:firefox`.
5. Submit the Firefox package to AMO as an **unlisted** add-on for signing.
6. Host the signed `.xpi` yourself after AMO returns it.

Use `SOURCE_CODE_REVIEW.md` for reviewer-facing build notes and the exact Firefox review flow.

## Release workflow

SudoFill ships with an automated release pipeline:

- **CI** runs on pushes and pull requests to `main`
- **Actionlint** validates workflow files
- **Release-please** opens and updates release PRs from `main`
- **Release** validates the tagged commit, rebuilds both browser bundles, packages artifacts, and uploads release assets

Release-please keeps these files in sync for versioned releases:

- `package.json`
- `CHANGELOG.md`
- `.release-please-manifest.json`
- `firefox-addon/manifest.json`

## Repository map

- `entrypoints/background.ts` — mailbox lifecycle, polling, badge updates, message routing
- `entrypoints/content.ts` — autofill entrypoint for supported pages
- `entrypoints/options/main.tsx` — autofill settings UI
- `entrypoints/popup/main.tsx` — Firefox popup UI
- `entrypoints/sidepanel/main.tsx` — Chrome side-panel UI
- `src/features/email/` — mailbox state, Mail.tm integration, email parsing, command routing
- `src/features/autofill/` — profile generation, matching heuristics, settings, content-script fill logic
- `wxt.config.ts` — manifest generation and browser-specific config
- `firefox.config.ts` — Firefox ID and optional update URL

## Status

The core temporary-email + autofill workflow is live and validated in CI. The main areas that still depend on site-specific behavior are complex registration forms and any flow that requires SMS or long-term mailbox access.

## License

GPLv3. See `LICENSE` for the full text.
