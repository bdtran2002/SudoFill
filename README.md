# SudoFill

SudoFill is a browser extension for temporary email signup flows. It can create a disposable mailbox, poll for verification messages, surface detected verification links, and autofill common signup-form identity fields on the currently open page.

## Implemented

- background mailbox runtime with Mail.tm account creation, refresh, cleanup, polling, alarm fallback, diagnostics, and badge updates
- popup UI for mailbox creation, refresh, copy, delete, message viewing, verification-link launching, and autofill triggering
- options UI for autofill defaults including address generation, state preference, age range, and sex bias
- content-script autofill for common identity and address fields on supported pages
- autofill profile generation for names, email, DOB, sex, and address fields with state-aware ZIP/city sampling
- settings normalization and validation for autofill preferences
- field matching for common labels, autocomplete tokens, camelCase/concatenated identifiers, and DOB variants
- safer autofill targeting that skips readonly/hidden fields and reduces cross-form spills
- mailbox helper, Mail.tm client, state, error, link-extraction, and autofill test coverage

Important current behavior:

- phone fields are intentionally **not autofilled**
- temp mailbox email is required before running popup autofill
- generic DOB fields support multiple date formats, while split DOB fields are handled separately

## Remaining Work

Highest-value remaining items:

- tighten form targeting further so autofill always stays within the single intended form on complex pages
- add DOM-level content-script tests for real fill behavior, not just string matching
- improve matching for fields identified only through `aria-labelledby` / fieldset legend context
- normalize more unsupported-page/content-script transport errors in the popup
- harden success/failure reporting around content-script delivery on edge-case pages

Nice-to-have later:

- iframe/all-frame autofill support
- broader select alias support like `CA - California` or abbreviated sex/gender values
- richer popup success feedback using the returned filled field names

## Stack

- `Bun` for package management and scripts
- `WXT` for the browser extension framework and Manifest V3 build pipeline
- `React` for popup and options UIs
- `TypeScript` for typed application code
- `Tailwind CSS` for styling
- `Vitest` for tests
- `ESLint` and `Prettier` for code quality and formatting

## Project Structure

- `entrypoints/background.ts` — mailbox runtime, polling, alarms, badge updates, popup command handling
- `entrypoints/content.ts` — signup-form autofill content script
- `entrypoints/popup/main.tsx` — popup UI for mailbox actions and autofill trigger
- `entrypoints/options/main.tsx` — autofill defaults/settings UI
- `src/features/autofill/` — profile generation, matching, settings, constants, and tests
- `src/features/email/` — Mail.tm client, command routing, state shaping, errors, link extraction, and tests

## Getting Started

1. Install dependencies:

```bash
bun install
```

2. Start local development:

```bash
bun run dev
```

3. Build the extension:

```bash
bun run build
```

## Useful Scripts

- `bun run dev` — start Chrome extension dev mode
- `bun run dev:firefox` — start Firefox dev mode
- `bun run build` — production build
- `bun run zip` — package extension zips
- `bun run lint` — run ESLint
- `bun run format` — write Prettier formatting
- `bun run format:check` — verify formatting
- `bun run typecheck` — run TypeScript checks
- `bun run test` — run Vitest

## Verification

CI order:

1. `bun run lint`
2. `bun run format:check`
3. `bun run typecheck`
4. `bun run build`

## Notes

- Manifest V3 is built through WXT.
- Generated directories like `.wxt/` and `.output/` are build artifacts.
- Mailbox session state uses `chrome.storage.session`.
- The popup is intentionally thin; mailbox behavior generally belongs in the background worker.
