# SudoFill

SudoFill is a browser extension for generating temporary email inboxes and supporting verification-email workflows during signup and testing flows.

This repository currently includes an MVP mailbox flow built with WXT, React, and Mail.tm integration.

## Stack

- `Bun`: package manager and script runner
- `WXT`: framework for building browser extensions, including Manifest V3 support
- `React`: UI for extension pages like the popup and options screen
- `TypeScript`: typed JavaScript for safer code
- `Tailwind CSS`: utility-first styling
- `ESLint`: linting for code quality
- `Prettier`: code formatting

## Current Structure

- `entrypoints/background.ts`: background worker for mailbox session state, polling, and badge updates
- `entrypoints/content.ts`: content script entrypoint placeholder
- `entrypoints/popup/`: popup UI for mailbox creation and inbox viewing
- `entrypoints/options/`: options page placeholder
- `src/features/email/`: Mail.tm integration, mailbox state, types, and link extraction
- `src/lib/`: shared helpers
- `src/types/`: shared types
- `src/styles.css`: shared Tailwind styles

## Getting Started

1. Install dependencies:

```bash
bun install