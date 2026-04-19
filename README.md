To make this README more user-friendly, we should pivot from "how it's built" to "how it solves the user's problem." I've streamlined the technical jargon, added clear value propositions, and used a more inviting tone while keeping the essential instructions intact.

-----

# ⚡ SudoFill

**Stop wasting time on repetitive signups.** SudoFill is a browser extension that automates account creation by providing temporary emails and smart autofill in one click.

-----

## 🚀 Why SudoFill?

Signing up for new services often feels like a chore. You have to invent a username, provide an email, wait for a verification code, and fill out a dozen fields. SudoFill handles the "boring stuff" so you can get to work (or play) faster.

### ✨ Key Features

  * **Instant Temporary Email:** Create a disposable mailbox powered by Mail.tm without leaving the page.
  * **Smart Autofill:** Automatically populates names, birthdays, and addresses using realistic (but fake) data.
  * **In-App Verification:** See incoming emails and click verification links directly from the extension popup—no more switching tabs.
  * **Privacy First:** Protect your real inbox from spam by using "sudo" identities for quick tests or one-time signups.

-----

## 🛠️ How It Works

1.  **Create:** Open the SudoFill icon and click "Create Mailbox."
2.  **Fill:** Click "Autofill" to instantly populate the signup form with your new email and personal details.
3.  **Verify:** Watch the SudoFill popup for your verification email.
4.  **Finish:** Click the link inside the popup to confirm your account. Done\!

-----

- a working temporary mailbox flow powered by Mail.tm
- automatic mailbox refresh, polling, cleanup, badge updates, and fallback refresh handling
- a Firefox popup UI and a Chrome side panel UI for creating, refreshing, copying, and deleting mailboxes
- message viewing and verification-link launching from the extension UI
- autofill for common signup fields
- autofill profile generation for names, email, date of birth, sex, and address details
- settings for autofill defaults like age range, state preference, and address generation behavior
- smarter field matching for common labels, autocomplete values, grouped DOB context, and signup-oriented naming patterns
- broader signup matching for first/last/full name, DOB, and hybrid email-or-phone style fields
- safer autofill behavior that avoids hidden or readonly fields and tries to focus on one relevant form

You’re in control of how SudoFill fills out forms. In the **Settings** menu, you can toggle:

  * **Age Ranges:** Set a preferred age range for generated birthdays.
  * **Location Prefs:** Choose specific states or address formats.
  * **Security:** SudoFill is designed to ignore hidden or "read-only" fields to keep your data safe and the form submission valid.

-----

## 🚧 Current Status & Limitations

SudoFill is fully functional and ready for daily use\! We are currently working on making it even smarter on complex websites.

**Note:** For your security, SudoFill **does not** autofill phone numbers. You will still need to handle SMS verification manually if a site requires it.

-----

## 👩‍💻 For Contributors & Developers

If you're looking to help build SudoFill or run it from the source code:

SudoFill is built with **Bun**.

```bash
# Install dependencies
bun install
```

### 2. Start the extension in development mode

Firefox is the default dev target:

# Run in development mode (Chrome)
bun run dev
```

For Chrome:

```bash
bun run dev:chrome
```

### 3. Build a production version

Firefox is the default build target:

```bash
bun run build
```

For Chrome:

```bash
bun run build:chrome
```

### Useful scripts

- `bun run dev` — start Firefox extension dev mode
- `bun run dev:firefox` — start Firefox extension dev mode
- `bun run dev:chrome` — start Chrome extension dev mode
- `bun run build` — create a Firefox production build
- `bun run build:firefox` — create a Firefox production build
- `bun run build:chrome` — create a Chrome production build
- `bun run zip` — package extension zip files
- `bun run lint` — run ESLint
- `bun run format` — format the codebase
- `bun run format:check` — check formatting
- `bun run typecheck` — run TypeScript checks
- `bun run test` — run Vitest

-----

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
