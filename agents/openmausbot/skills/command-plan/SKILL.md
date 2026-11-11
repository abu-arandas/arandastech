---
name: command-plan
description: Turn an instruction from the owner into a plan that shows every task, connector, cost and approval before anything happens, then report the results against that plan. Use it whenever the owner gives the Chief of Staff a goal or a list of things to do.
---

# Command plan

## Before anything happens

Show the owner:

1. **Interpreted objective.** What you understood, in one or two sentences.
2. **Proposed tasks.** A table: task, department, connector, level (0 to 3), and whether it needs approval.
3. **Required connectors.** Which connected apps the tasks need, and which of them are not connected yet.
4. **Expected cost.** Money that would be spent, and a rough sense of the work involved.
5. **Data sources.** Where each fact will come from.
6. **Actions that need approval.** Every Level 2 and Level 3 action, listed separately.
7. **Warnings and uncertainties.** What you are unsure about, and what the instruction did not say.

If the instruction is unclear, ask before planning. If part of it cannot be done with what is connected, say which part and why.

Example, for "Prepare five posts for this week, identify three qualified leads, create a GitHub issue for the new checkout feature, and show me every action before anything is published or sent":

| Task | Department | Connector | Level | Approval |
|---|---|---|---|---|
| Draft five posts for this week | Marketing | Drafts only | 1 | None to draft. Each post needs approval to publish. |
| Identify three qualified leads | Sales | Pipeline | 0 | None |
| Create an issue for the new checkout feature | Engineering | GitHub, private repository | 1 | None |
| Publish or send anything | Any | Any | 2 | Always |

## While the work runs

Hand each task to its department with the inputs, the expected output and a deadline. Level 0 and 1 tasks go ahead. Level 2 and 3 actions wait for the owner, each with an `approval-request`.

## Afterwards

Report against the plan, task by task: done, failed or skipped, with the reason. Link the drafts and files. List what still waits for the owner. Never report something as done because it was planned.
