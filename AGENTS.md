# AGENTS

- Use `bun` instead of `npm` or `node`
- Use **Conventional Commit** format for git commits
- Keep changes minimal and targeted

- CI verification order (run in this sequence): `lint → format:check → typecheck → build`

- `background/` reserved for future email polling, badge, and notification work
- `popup/` reserved for quick actions and inbox summary UI
- `options/` reserved for user preferences
- `content/` reserved for future page form-detection and fill behavior

- Use `neverthrow` for error-as-values patterns (already installed)
