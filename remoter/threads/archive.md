# Archive

Old tasks and notes, moved here when Claude passes a ball back. Use Move to… to bring one back.

## Chat from main
- 💬 Please review the uncommitted changes and let me know what it's doing?
- 🤖 It makes scanning recover from a stuck camera or network:
- 🤖 **scanner.ts**: one bad frame no longer kills the decode loop (try/catch). A paused video gets play() again. If the OS ends the camera track, it reopens it. If getUserMedia fails, it retries every 1s until stop().
- 🤖 **offline.ts**: race preview now times out after 5s (AbortSignal) and falls back to the join link's name. Before, a hung request froze the scanner.
- 🤖 Tests cover each case; JoinRace/Scan tests just accept the new 2nd arg.
- 🤖 Concerns:
- 🤖 1. Retry fires on *every* getUserMedia error, incl. permission denied (NotAllowedError) or no camera. That's a 1/s error loop, maybe re-prompting. I'd skip retry for NotAllowedError/NotFoundError.
- 🤖 2. A frame error that persists logs console.error ~60×/sec. Fine, but noisy.
- 🤖 3. Useful comments were deleted (why `session` exists, why AbortError is ignored, why the stream is a real MediaStream / video muted). Looks accidental; I'd restore them.
- 🤖 I didn't run the tests (no shell permission). Want me to fix 1 and 3?
- 💬 ask for the permissions that you need
- 🤖 Added to permissions.md: `pnpm vitest run *`, `pnpm lint`, `git diff *`. Tick them, and add a task (or say "yes") if you want fixes 1 and 3 too.
- 💬 Propose the changes and I'll add them to the todo
- 🤖 Tests for the 4 changed files pass (48/48). Proposed tasks, copy any into Tasks:
- 🤖 A. Don't retry the camera on NotAllowedError/NotFoundError/OverconstrainedError (permission denied, no camera); add a test.
- 🤖 B. Restore the deleted comments in scanner.ts and scanner.test.tsx.
- 🤖 C. (optional) Log a frame decode error once per session, not every frame.
- 💬 There is a mechanic for you to propose a change, let me know why you haven't used it
- 🤖 No good reason. I took "add them to the todo" literally and replied in chat instead of using the multiple-choice question. Fixed: it's under Claude needs you now.
- 🤖 Did A and C, skipped B. Scanner/offline/JoinRace/Scan tests pass (52/52), lint clean. Not committed.
- 🤖 Moved the racer setup/print task to `racer-setup.md`, with design questions there. Pass me the ball in that thread.
- 🤖 You re-added it here, so I'll keep it in main and deleted racer-setup.md. Plan: "Racers" page in the menu. Editable table (add row, paste a list, edit/delete), a checkbox per row, "Print all" and "Print selected" for partial reprints. Print uses the browser dialog with print-only CSS, so it works on Android and desktop. Questions above, then I'll build.
- 🤖 Racer setup, per your answers:
- 🤖 **DB**: `runner.name` (only set on this page) + `race_runner` table (page adds or first scan). Migration not generated yet.
- 🤖 **API**: list/add/rename/remove racers on `/races/:id/runners`, joined users only. Can't remove a racer with laps.
- 🤖 **QR**: page-added racers encode only their uuid. Scanned ones reprint their original text. Table shows "QR scans to".
- 🤖 **Racers page** (menu): paste names, edit inline, tick rows, Print all / Print selected.
- 🤖 **Print**: lanyard badge = ISO/IEC 7810 ID-1 (CR80, 54×85.6mm), the size standard badge holders take, 9 per A4 with cut lines. Or A4, one big code per page. Both show race name + QR (+ name, optional).
- 🤖 Names now prefer the assigned one in Summary/CSV. A bare uuid is no longer shown as a name.
- 🤖 Component/helper tests pass (111). Lint clean. API + migration tests written but need the migration to run.
- 🤖 Done: generated `drizzle/20261026202456_racer_setup` and added a backfill (racers already scanned into a race join its list). Names on badges stay on by default, with the "Print names" checkbox next to the Print buttons.
- 🤖 Scan popup: devices store each race's assigned names (on sync and from the Racers page), so it shows "Lap 3 - Sam" even offline.
- 🤖 All 198 tests pass, tsc and lint clean. Not yet checked: real print output on a phone/printer. Worth a test print before race day. Run `npx drizzle-kit migrate` on prod before deploying.
- 🤖 justfile: `dev-tailscale` runs `tailscale serve` → https://<machine>.ts.net (HTTPS so phone cameras work), prints the URL, stops serving on exit. Vite now allows `.ts.net` hosts. Needs HTTPS enabled for your tailnet. Untested: I can't run `just` or `tailscale` here.
- 🤖 Checked: the scanner changes were staged, not committed. Now committed:
- 🤖 `1708f4e` scanner recovery (incl. A/C).
- 🤖 `6d0960c` racer setup, plus the 5s race-preview timeout. It shares offline.ts with the racer changes, and I couldn't unstage to split them.
- 🤖 Thread files are left out and still staged.

## Tasks from main
- [x] A. Don't retry camera on permission denied / no camera (+ test)  ✅ scanner.ts skips retry on NotAllowed/NotFound/Overconstrained; 3 tests
- [x] C. Log a frame decode error once per session  ✅ logged once per start(); 1 test