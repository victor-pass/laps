## Remoter permissions
Tick `[x]` = every turn, `[1]`–`[9]` = that many turns, untick = revoke. Remoter asks by adding unticked lines. These apply to every thread.
- [ ] Allow: commit
- [x] Allow: `pnpm vitest run *` — run tests
- [x] Allow: `pnpm lint` — lint changes
- [x] Allow: `git diff *` — review uncommitted changes
- [x] Allow: `pnpm tsc --noEmit` — type-check (tests and lint don't)
- [x] Allow: `rm src/components/RacersShot.test.tsx` — delete the temporary screenshot helper
- [x] Allow: `rm src/components/SyncShot.test.tsx` — delete the temporary Sync/Race screenshot helper
- [x] Allow: `pnpm drizzle-kit generate *` — create the racer-setup migration (offline, no DB connection)

## Remoter reads
<!-- Files added to Remoter's prompt: `- [x] Read: \`TENETS.md\` — why`, paths from the project root. Same ticks as above. -->
