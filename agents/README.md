# Agents Directory — Capital Empire

This directory contains instructions, PR templates, and task specifications for Arena coding agents working on **Capital Empire** (`rumcan/CapitalEmpire`).

## Contents

- **`agents/arena/INSTRUCTIONS.md`** — Mandatory workflow for Arena agents: GitHub issue claiming (`arena` + `status:*` labels), immediate branch (`arena/<ticket-id>-<slug>`) and draft PR, continuous pushes every 15–20 minutes, pre-push `npm run typecheck` & `npm test`, `FINAL PUSH <sha>` comment + Google Drive status sync (`PR-<ticket-id>-STATUS.md`), and the 20-minute review loop (`gh pr view --comments` + Drive `REVIEW-<ticket-id>.md`).

- **`agents/arena/PR_TEMPLATE.md`** — Required pull request template for all Arena PRs.

- **`agents/tasks/`** — Legacy task files `T001`–`T017`. All new UIX revamp tickets start at **`T018`** and are tracked as GitHub Issues labelled `arena` and mirrored as `TICKET-T0xx-*.md` in the shared Google Drive folder `Capital Empire - Argon` (`11pAG2rlxViL4bby-cUapecWmP43gv7hC`).
