# SudoFill Firefox Review Notes

## Build commands

```bash
bun install
bun run lint
bun run format:check
bun run typecheck
bun run build:firefox
bun run zip:firefox
```

## Packaging notes

- Firefox builds are generated with WXT.
- The Firefox toolbar action opens `popup.html`.
- Chrome keeps the side-panel workflow.
- `FIREFOX_EXTENSION_ID` sets `browser_specific_settings.gecko.id`.
- `FIREFOX_UPDATE_URL` is optional and only used for self-hosted Firefox updates.

## External services

- `https://api.mail.tm/*` for mailbox creation, polling, and message retrieval.

## Data handling

- Temporary mailbox session state is stored in `chrome.storage.session`.
- Autofill preferences are stored in `chrome.storage.sync`.
- The extension does not execute remote code.
- Verification links found in emails open in a new browser tab.

## Main review entrypoints

- `wxt.config.ts`
- `entrypoints/background.ts`
- `entrypoints/popup/main.tsx`
- `entrypoints/sidepanel/main.tsx`
- `entrypoints/content.ts`
- `src/features/email/mailbox-app.tsx`
