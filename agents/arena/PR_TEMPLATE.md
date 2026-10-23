## Ticket

Closes #<issue-number>

## Summary of Changes

- Ticket: `[<ticket-id>] <title>`

- Files touched (must match the ticket's **Files you may touch** list):

  - `<path>`

## Pre-Push Verification

- [ ] `npm run typecheck` passes (0 errors)

- [ ] `npm test` passes (`<passed>/<total>`)

- [ ] Only files listed in the ticket's **Files you may touch** were modified

- [ ] No new npm dependencies, no `Math.random()`, `/** ... */` doc comments on all exports

- [ ] `PR-<ticket-id>-STATUS.md` (with `FINAL PUSH <sha>`, test summary, and `git diff origin/main...HEAD`) uploaded to Google Drive (`Capital Empire - Argon`)

## Test Output

```text

<paste npm run typecheck and npm test output summary>
Notes
* Anything unsure or unrelated test flakes observed: <none>
