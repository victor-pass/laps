# Archive

Old tasks and notes, moved here when Claude passes a ball back. Use Move to… to bring one back.

## Chat from main
> 💬 Please review the uncommitted changes and let me know what it's doing?
> 🤖 It makes scanning recover from a stuck camera or network:
> 🤖 **scanner.ts**: one bad frame no longer kills the decode loop (try/catch). A paused video gets play() again. If the OS ends the camera track, it reopens it. If getUserMedia fails, it retries every 1s until stop().
> 🤖 **offline.ts**: race preview now times out after 5s (AbortSignal) and falls back to the join link's name. Before, a hung request froze the scanner.
> 🤖 Tests cover each case; JoinRace/Scan tests just accept the new 2nd arg.
> 🤖 Concerns:
> 🤖 1. Retry fires on *every* getUserMedia error, incl. permission denied (NotAllowedError) or no camera. That's a 1/s error loop, maybe re-prompting. I'd skip retry for NotAllowedError/NotFoundError.
> 🤖 2. A frame error that persists logs console.error ~60×/sec. Fine, but noisy.
> 🤖 3. Useful comments were deleted (why `session` exists, why AbortError is ignored, why the stream is a real MediaStream / video muted). Looks accidental; I'd restore them.
> 🤖 I didn't run the tests (no shell permission). Want me to fix 1 and 3?
> 💬 ask for the permissions that you need
> 🤖 Added to permissions.md: `pnpm vitest run *`, `pnpm lint`, `git diff *`. Tick them, and add a task (or say "yes") if you want fixes 1 and 3 too.
> 💬 Propose the changes and I'll add them to the todo
> 🤖 Tests for the 4 changed files pass (48/48). Proposed tasks, copy any into Tasks:
> 🤖 A. Don't retry the camera on NotAllowedError/NotFoundError/OverconstrainedError (permission denied, no camera); add a test.
> 🤖 B. Restore the deleted comments in scanner.ts and scanner.test.tsx.
> 🤖 C. (optional) Log a frame decode error once per session, not every frame.