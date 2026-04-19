<p align="center">
  <img src="./assets/icon.png" alt="SudoFill icon" width="96" height="96" />
</p>

<h1 align="center">SudoFill</h1>

<p align="center">
  A browser extension for faster signup flows with temporary email and smart autofill.
</p>

---

SudoFill helps you move through repetitive signup flows without doing the same manual steps every time.

It can generate a temporary email address, watch for verification emails, surface verification links, and autofill common signup fields like name, birthday, and address.

## How It Works

1. Open SudoFill and create a temporary mailbox.
2. Use that email in the signup flow.
3. Let SudoFill autofill common form fields on the page.
4. Wait for the verification email to arrive in the extension.
5. Open the detected verification link and continue.

## What’s Left To Do

Here’s the main work still planned:

- improve autofill reliability on more complex pages and multi-form layouts
- add more realistic page-level testing for actual fill behavior
- better support fields identified through accessibility labels and grouped field context
- make popup success and error messaging clearer on difficult or unsupported pages
- expand support for edge cases like iframes and more dropdown/select formats

## What’s Done So Far

SudoFill already includes:

- a working temporary mailbox flow powered by Mail.tm
- automatic mailbox refresh, polling, cleanup, badge updates, and fallback refresh handling
- a popup interface for creating, refreshing, copying, and deleting mailboxes
- message viewing and verification-link launching from the popup
- autofill for common signup fields
- autofill profile generation for names, email, date of birth, sex, and address details
- settings for autofill defaults like age range, state preference, and address generation behavior
- smarter field matching for common labels, autocomplete values, and naming patterns
- safer autofill behavior that avoids hidden or readonly fields and tries to focus on one relevant form

## Current Limitations

- phone fields are intentionally not autofilled
- a temporary mailbox email must exist before popup autofill runs
- some unusual page structures still need better support

## Why This Exists

Testing or repeating account creation flows gets tedious fast. SudoFill is built to remove the repetitive parts so you can focus on the actual flow instead of typing the same details over and over.

## Status

SudoFill is already functional. Most of the remaining work is about polish, edge cases, and making the experience more reliable across more websites.

---

## Running Locally for Development

If you want to work on SudoFill locally:

### 1. Install dependencies

```bash
bun install
```

### 2. Start the extension in development mode

For Chrome:

```bash
bun run dev
```

For Firefox:

```bash
bun run dev:firefox
```

### 3. Build a production version

```bash
bun run build
```

### Useful scripts

- `bun run dev` — start Chrome extension dev mode
- `bun run dev:firefox` — start Firefox extension dev mode
- `bun run build` — create a production build
- `bun run zip` — package extension zip files
- `bun run lint` — run ESLint
- `bun run format` — format the codebase
- `bun run format:check` — check formatting
- `bun run typecheck` — run TypeScript checks
- `bun run test` — run Vitest

### Verification order

CI runs checks in this order:

1. `bun run lint`
2. `bun run format:check`
3. `bun run typecheck`
4. `bun run build`
