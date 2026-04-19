---

# ⚡ SudoFill

SudoFill helps you get through sign-up forms faster.

It gives you a temporary email address, fills common fields for you, and lets you check verification emails without bouncing between tabs.

SudoFill connects to Mail.tm over HTTPS to create disposable inboxes and read incoming verification emails. Chrome uses a side panel; Firefox uses a toolbar popup for the same flow.

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

In the popup, click **Create Mailbox**.

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

1. Copy `.env.example` to `.env` and set a stable `FIREFOX_EXTENSION_ID`.
2. Run `bun run build:firefox`.
3. Run `bun run zip:firefox` to create the Firefox package and source zip.
4. Submit the Firefox package to AMO as an **unlisted** add-on for signing.
5. Host the signed `.xpi` yourself after AMO returns it.
6. If you want self-hosted automatic updates, set `FIREFOX_UPDATE_URL` to an HTTPS update manifest before packaging.

`SOURCE_CODE_REVIEW.md` includes the exact build and review notes for Firefox submission.

</details>

## License

MIT. See `LICENSE` for details.
