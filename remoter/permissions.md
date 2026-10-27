## Claude permissions
Tick `[x]` = every turn, `[1]`–`[9]` = that many turns, untick = revoke. Claude asks by adding unticked lines. These apply to every thread.
- [ ] Allow: commit
- [x] Allow: `pnpm vitest run *` — run tests
- [x] Allow: `pnpm lint` — lint changes
- [x] Allow: `git diff *` — review uncommitted changes
- [x] Allow: `pnpm tsc --noEmit` — type-check (tests and lint don't)
- [x] Allow: `pnpm drizzle-kit generate *` — create the racer-setup migration (offline, no DB connection)
- [ ] Allow: `remote --help` — check `remote expose` returns rather than blocking
