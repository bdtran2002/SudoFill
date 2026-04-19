<p align="center">
  <img src="./assets/icon.png" alt="SudoFill icon" width="96" height="96" />
</p>

# ⚡ SudoFill

SudoFill helps you get through sign-up forms faster.

It gives you a temporary email address, fills common fields for you, and lets you check verification emails without bouncing between tabs.

SudoFill connects to Mail.tm over HTTPS to create disposable inboxes and read incoming verification emails. Chrome uses a side panel; Firefox uses a toolbar popup for the same flow. Autofill runs on standard HTTPS pages, and page-fill data stays in the browser unless you choose to submit the form yourself.

## What it does

- **Creates a temporary email** so you do not have to use your real inbox
- **Autofills common sign-up fields** like name, birthday, address, and email
- **Shows incoming verification emails** right inside the extension
- **Opens verification links quickly** so you can finish sign-up faster

## Who it is for

SudoFill is useful when you want to:

- sign up for something quickly
- avoid spam in your personal inbox
- test forms with realistic sample information
- make one-off accounts without typing everything by hand

## How to use SudoFill

### 1. Open the extension

Click the SudoFill icon in your browser toolbar.

### 2. Create a mailbox

In the extension UI, click **Create Mailbox**.

SudoFill will generate a temporary email address for you.

### 3. Go to the website you want to join

Open the sign-up page like you normally would.

### 4. Autofill the form

Click **Autofill** in SudoFill.

The extension will try to fill in the main sign-up fields for you.

### 5. Check for the verification email

If the website sends a confirmation email, open SudoFill again and wait for the message to appear.

### 6. Open the verification link

Click the link from the email inside the extension to finish setting up the account.

## What SudoFill usually fills in

Depending on the form, SudoFill can fill in:

- first name and last name
- email address
- date of birth
- sex or gender field when a form asks for it
- address details

You can also adjust some autofill preferences in **Settings**.

## Good to know

- **Temporary email only:** These inboxes are meant for short-term use.
- **Phone numbers are not autofilled:** If a site needs SMS verification, you will still need to do that yourself.
- **Some sites may need a quick manual fix:** Very unusual or complex forms may still need a few edits.
- **Hidden and read-only fields are avoided:** SudoFill tries not to fill fields that should be left alone.
- **Autofill targets normal HTTPS pages:** Browser internal pages and unsupported contexts are skipped.

## When to use it

SudoFill is best for:

- quick sign-ups
- testing forms
- avoiding marketing emails in your real inbox

It is **not** a good fit for accounts you need to keep long term if the service depends on permanent email access.

## Current status

SudoFill is already usable today and supports the main temporary-email + autofill flow.

We are still improving support for more complicated websites and edge-case forms.

<details>
<summary><strong>Developer setup</strong></summary>

### Install dependencies

SudoFill is built with **Bun**.

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

### Build production bundles

Firefox:

```bash
bun run build
```

Chrome:

```bash
bun run build:chrome
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

### Firefox self-distribution

Firefox release builds still need Mozilla signing, even when you host the add-on yourself.

1. Set the stable Firefox add-on ID in `firefox.config.ts`.
2. Run `bun run build:firefox`.
3. Run `bun run zip:firefox` to create the Firefox package and source zip.
4. Submit the Firefox package to AMO as an **unlisted** add-on for signing.
5. Host the signed `.xpi` yourself after AMO returns it.
6. If you want self-hosted automatic updates, set `gecko.update_url` in `firefox.config.ts` to your HTTPS update manifest before packaging.

`SOURCE_CODE_REVIEW.md` includes the exact build and review notes for Firefox submission.

### Fastest path to Firefox Add-ons / signing

If you want this live as fast as possible, there are two paths:

- **Unlisted** — fastest for signed self-distribution
- **Listed** — public Firefox Add-ons page on AMO

#### Fastest self-distribution path

1. Create or sign into your AMO developer account at <https://addons.mozilla.org/developers/>.
2. Set a real Firefox `gecko.id` in `firefox.config.ts`.
3. Bump the extension version before packaging.
4. Run:

   ```bash
   bun run lint
   bun run format:check
   bun run typecheck
   bun run test
   bun run build:firefox
   bun run zip:firefox
   ```

5. In AMO, submit the Firefox build as an **unlisted** add-on.
6. Upload the generated Firefox package and source zip from `.output/`.
7. Use `SOURCE_CODE_REVIEW.md` when AMO asks how to build and review the add-on.
8. Make sure the submission description matches the real behavior: SudoFill creates a disposable mailbox through Mail.tm, reads incoming verification emails, and autofills fields locally on supported HTTPS pages.
9. Wait for signing/review, then download the signed `.xpi`.
10. Host that signed `.xpi` yourself. If you want self-hosted updates, also host an HTTPS update manifest and set `gecko.update_url` in `firefox.config.ts` before the next release.

#### If you want a public Firefox Add-ons page

Follow the same build steps, but choose **Listed** instead of **Unlisted** during AMO submission and complete the listing details Mozilla asks for.

</details>

## License

MIT. See `LICENSE` for details.
