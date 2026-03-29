# Promote Backlog

Purpose: promote a GitHub issue from Backlog to Ready on the Faculytics project board and assign the next `FAC-XX` ticket number.

## Project Context

- Org: `CtrlAltElite-Devs`
- Repo: `api.faculytics`
- Project number: `1`
- Project ID: `PVT_kwDODSVvHc4BRISI`
- Status field ID: `PVTSSF_lADODSVvHc4BRISIzg_DCfA`
- Ready option ID: `32dbe553`
- Ticket prefix: `FAC-`

## Workflow

1. List project items with:
   - `gh project item-list 1 --owner CtrlAltElite-Devs --format json --limit 100`
2. Filter for issues whose status is `Backlog`.
3. Let the user choose which backlog issue to promote, unless they already provided an issue number.
4. Inspect existing issue titles to determine the next unused `FAC-XX` number.
5. Propose a final title in the format:
   - `FAC-XX type: description`
6. Confirm before making changes.
7. Update the issue title if needed:
   - `gh issue edit <number> --repo CtrlAltElite-Devs/api.faculytics --title "FAC-XX type: description"`
8. Move the project item to `Ready`:
   - `gh project item-edit --project-id PVT_kwDODSVvHc4BRISI --id <item-id> --field-id PVTSSF_lADODSVvHc4BRISIzg_DCfA --single-select-option-id 32dbe553`

## Rules

- Verify the `FAC-XX` number is unused before assigning it.
- If the issue already has a `FAC-XX` prefix, skip renaming and only move it.
- Use one of these title types when suggesting the new title:
  - `feat`
  - `fix`
  - `chore`
  - `refactor`
  - `docs`
  - `test`
  - `perf`
