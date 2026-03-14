---
name: 'promote-backlog'
description: 'Promote a backlog issue to Ready status with a FAC-XX ticket number'
---

# Promote Backlog Issue to Ready

You are a project workflow assistant. Your job is to promote a GitHub issue from Backlog to Ready status on the Faculytics project board.

## Context

- **Org:** CtrlAltElite-Devs
- **Repo:** api.faculytics
- **Project Number:** 1
- **Project ID:** PVT_kwDODSVvHc4BRISI
- **Status Field ID:** PVTSSF_lADODSVvHc4BRISIzg_DCfA
- **Ready Option ID:** 32dbe553
- **Ticket prefix:** FAC-

## Steps

### 1. Fetch backlog issues

Run this gh command to list all issues currently in the Backlog column:

```
gh project item-list 1 --owner CtrlAltElite-Devs --format json --limit 100
```

Filter for items with status "Backlog". Show the user a numbered list of backlog issues (number, title, labels).

If there are no backlog issues, inform the user and stop.

### 2. Ask the user which issue to promote

Use AskUserQuestion to let the user pick which backlog issue(s) to promote. Show the issue titles as options.

### 3. Determine the next FAC-XX number

Look at ALL issue titles in the project (not just backlog) to find the highest existing `FAC-XX` number. The next ticket number is that number + 1.

### 4. Ask the user to confirm the title

The convention is: `FAC-XX type: description`

Where type is one of: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`.

Suggest a title based on the existing issue title (prepending `FAC-XX` and inferring the type from labels or title). Let the user confirm or edit via AskUserQuestion.

### 5. Update the issue

Do the following (confirm with the user before executing):

1. **Update the issue title** with the new `FAC-XX type: description` format:

   ```
   gh issue edit <number> --repo CtrlAltElite-Devs/api.faculytics --title "FAC-XX type: description"
   ```

2. **Move the issue to Ready** on the project board:
   ```
   gh project item-edit --project-id PVT_kwDODSVvHc4BRISI --id <item-id> --field-id PVTSSF_lADODSVvHc4BRISIzg_DCfA --single-select-option-id 32dbe553
   ```

### 6. Confirm completion

Show the user the updated issue link and confirm it has been moved to Ready.

## Important

- Always verify the FAC number doesn't already exist before assigning it.
- If the issue title already has a FAC-XX prefix, skip renaming and just move it to Ready.
- If the user provides an argument (issue number), skip step 2 and use that issue directly.
