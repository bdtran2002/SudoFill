# SudoFill

SudoFill is a browser extension for generating temporary email inboxes and supporting verification-email workflows during signup and testing flows.

Built with WXT, React, and Mail.tm integration.

## Stack

- `Bun`: package manager and script runner
- `WXT`: framework for building browser extensions (Manifest V3 for Chrome, MV2 for Firefox)
- `React`: UI for extension pages (popup, options)
- `TypeScript`: typed JavaScript
- `Tailwind CSS`: styling
- `ESLint` + `Prettier`: code quality

## Project Structure

```
entrypoints/
├── background.ts      # Background worker: mailbox polling (every 3s), session state
├── content.ts        # Content script placeholder
├── popup/           # Popup UI: create inbox, view messages
└── options/        # Options page placeholder
src/
├── features/email/  # Mail.tm API, types, state, link extraction
├── lib/            # Shared helpers
├── types/          # Shared types
└── styles.css      # Tailwind styles
```

## Commands

```bash
# Install dependencies
bun install

# Development
bun run dev              # Chrome dev server
bun run dev:firefox      # Firefox dev server

# Build
bun run build            # Build (Chrome by default)
bun run build --browser firefox  # Build Firefox

# Code quality
bun run lint             # ESLint
bun run format          # Format with Prettier
bun run format:check    # Check formatting
bun run typecheck       # TypeScript
```

## Features

- Create temporary email inboxes via Mail.tm
- Auto-refresh inbox every 3 seconds with syncing indicator
- Auto-detect verification links in emails
- Save email templates for reuse
- Track email history

## Getting Started

1. Install dependencies:

```bash
bun install
```

2. Start development server:

```bash
bun run dev
```

3. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `.output/chrome-mv3-dev` directory

## CI

CI runs on push to `main` and pull requests:

```bash
bun run lint && bun run format:check && bun run typecheck && bun run build
```
