# SudoFill

SudoFill is a browser extension project for generating temporary signup identities and helping with temporary email-based verification flows.

This repository is currently only the initial scaffold. No product logic has been implemented yet.

## Stack

- `Bun`: package manager and script runner.
- `WXT`: framework for building browser extensions, including Manifest V3 support.
- `React`: UI for extension pages like the popup and options screen.
- `TypeScript`: typed JavaScript for safer code.
- `Tailwind CSS`: utility-first styling.
- `ESLint`: linting for code quality.
- `Prettier`: code formatting.

## Current Structure

- `entrypoints/background.ts`: future background worker.
- `entrypoints/content.ts`: future content script.
- `entrypoints/popup/`: popup UI.
- `entrypoints/options/`: options UI.
- `src/features/`: future feature code.
- `src/lib/`: future shared helpers.
- `src/types/`: future shared types.

## Getting Started

1. Install dependencies:

```bash
bun install
```

2. Start local development:

```bash
bun run dev
bun run dev:firefox
```

3. Build the extension:

```bash
bun run build
```



## Useful Scripts

- `bun run dev`: start WXT dev mode.
- `bun run build`: build the extension.
- `bun run zip`: create a distributable zip.
- `bun run lint`: run ESLint.
- `bun run format`: format files with Prettier.
- `bun run format:check`: check formatting without changing files.
- `bun run typecheck`: run TypeScript checks.

## Notes

- We are using Manifest V3 through WXT.
- CI runs lint, formatting checks, typechecking, and build checks on PRs and pushes to `main`.
- `neverthrow` is installed for future error-as-values patterns, but is not used yet.
