---
name: label-sync
description: Create or update this repository's GitHub labels from .github/labels.json (status:*, type:*, priority:*, area:*, phase:*). Use when setting up the repo, after editing labels.json, or when an issue command fails because a label is missing.
---

# label-sync

`.github/labels.json` is the single source of truth for labels. The `status:*`, `type:*` and `priority:*` sets match the dw plugin's `project-labels` standard, but issue work still starts only with `issue-start` (its workflow skills are not used here); nothing in this repository needs the plugin. `area:*` and `phase:*` are specific to this repository; their meanings are in `.claude/rules/labels.md`.

Never create a label ad hoc in an issue. Add it to the file first, then run this skill.

## Steps

1. Confirm the GitHub CLI can see the repository:
   ```sh
   gh repo view OSSCA-thorvg/GameJam-Vampire-Survivors --json nameWithOwner
   ```
   A "Could not resolve" or 404 error means the active `gh` account lacks access. Stop and ask the user to get access for their account, or to `gh auth login` / `gh auth switch` to an account that has it. Do not work around it.
2. Create or update every label. `--force` updates the color and description of labels that already exist:
   ```sh
   jq -c '.[]' .github/labels.json | while read -r l; do
     gh label create "$(jq -r .name <<<"$l")" \
       --color "$(jq -r .color <<<"$l")" \
       --description "$(jq -r .description <<<"$l")" \
       --force -R OSSCA-thorvg/GameJam-Vampire-Survivors
   done
   ```
3. List labels that exist on GitHub but not in the file:
   ```sh
   comm -13 <(jq -r '.[].name' .github/labels.json | sort) \
            <(gh label list -R OSSCA-thorvg/GameJam-Vampire-Survivors --limit 200 --json name -q '.[].name' | sort)
   ```
   Report them to the user. Delete them only if the user confirms; GitHub's default labels (`bug`, `enhancement`, …) can go.
4. Verify the result with `gh label list --limit 200`. The default limit of 30 silently truncates the list.

## Label rules

Every issue carries exactly one each of `status:*`, `type:*`, `priority:*` and `phase:*`, plus at least one `area:*`. PRs carry the same `type:*`, `priority:*`, `area:*` and `phase:*` as their issue. Apply and remove labels with `gh issue edit`; it also works on PR numbers.

The `status:*` lifecycle:

| Transition                             | When                                                                                  | Skill                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| → `status:ready`                       | Issue created and its dependencies are merged                                         | `issue-create`                                                           |
| → `status:blocked`                     | Issue created while a dependency is open, or waiting on a decision; comment why       | `issue-create` / manual                                                  |
| `status:blocked` → `status:ready`      | Every issue under its "Depends on" is closed                                          | auto-merge workflow after a merge (ADR 0012); verified by `issue-finish` |
| `status:ready` → `status:in-progress`  | Someone starts implementing                                                           | `issue-start`                                                            |
| `status:in-progress` → `status:review` | PR about to be opened                                                                 | `issue-finish`                                                           |
| `status:review` → `status:done`        | PR squash-merged by the auto-merge workflow on green CI; `Closes #N` closes the issue | auto-merge workflow (ADR 0012); verified by `issue-finish`               |
| `status:backlog`                       | Agreed idea, not planned yet                                                          | manual                                                                   |
| `status:wontfix`                       | Dropped; close with a comment                                                         | manual                                                                   |
