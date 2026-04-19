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

Verified locally with Bun 1.3.11.

## Packaging notes

- Firefox builds are generated with WXT.
- The Firefox toolbar action opens `popup.html`.
- Firefox also exposes the same mailbox UI through `sidebar_action` because the shared sidepanel entrypoint is still bundled.
- Chrome keeps the side-panel workflow.
- `firefox.config.ts` sets `browser_specific_settings.gecko.id`.
- `firefox.config.ts` may optionally set `browser_specific_settings.gecko.update_url` for self-hosted Firefox updates.

## External services

- `https://api.mail.tm/*` for mailbox creation, polling, and message retrieval.
- No reviewer credentials are required.

## Data handling

- Temporary mailbox session state is stored in `chrome.storage.session`.
- Autofill preferences are stored in `chrome.storage.sync`.
- The extension does not execute remote code.
- Verification links found in emails open in a new browser tab.
- Firefox data categories are declared as `personallyIdentifyingInfo`, `personalCommunications`, and `authenticationInfo` because the extension creates a disposable mailbox account, authenticates against Mail.tm, and reads incoming emails.
- The content script only runs on `https://*/*` pages. Autofill is user-triggered from the extension UI and does not transmit page content to Mail.tm.

## Manual reviewer flow

1. Load the Firefox build or signed XPI.
2. Click the toolbar button to open the popup.
3. Create a mailbox and verify the generated address appears.
4. Open any HTTPS signup page and run autofill.
5. Open the options page and save settings.
6. Refresh or discard the mailbox.
7. If a message arrives, open it and click a detected verification link.

## Main review entrypoints

- `wxt.config.ts`
- `firefox.config.ts`
- `entrypoints/background.ts`
- `entrypoints/popup/main.tsx`
- `entrypoints/sidepanel/main.tsx`
- `entrypoints/content.ts`
- `src/features/email/mailbox-app.tsx`
