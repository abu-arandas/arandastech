# The Arandas Tech departments in OpenMausBot

This folder turns the eight AI departments of the [blueprint](../../docs/blueprint.md) into a team you can install in [OpenMausBot](https://github.com/milind-soni/OpenMausBot), an open-source desktop app in which each bot is an AI agent running on the Claude, Codex or Grok command-line tool you are already signed in to.

| | |
|---|---|
| **Bots** | Operations (Chief of Staff), Engineering, Marketing, Sales, Support, Commerce, Finance, Security |
| **Rooms** | Company, Growth, Store and money, Engineering and security |
| **Skills** | 13, from writing an approval request to checking a price floor |
| **Routines** | 5, all paused until you turn them on |
| **Starts at** | "Ask for approval", with no computer access |

## Read this first

OpenMausBot's own default is the opposite of the blueprint's rules:

- **Every new or imported bot starts at "Full access".** At that level a bot runs commands and edits files without asking.
- **A bot with no "Sending on your behalf" setting sends through connected apps without asking**, with no daily limit. That covers email, messages, posts and payments.

The team file in this folder sets every bot to "Ask for approval". The second setting has no field in the team file, so you set it by hand in step 3. Do both before you connect any app.

## What you need

- A computer running macOS, Windows or Ubuntu 24.04.
- At least one of the `claude`, `codex` or `grok` command-line tools, installed and signed in. The bots use that sign-in, so there is no separate bill from this team.
- Node.js 24 or newer, for the command-line route below.

## Install

### 1. Install OpenMausBot

Download the desktop app from the OpenMausBot releases page, or install the command-line tool:

```bash
npm install -g openmausbot
```

### 2. Apply the team

Get this repository and open this folder:

```bash
git clone https://github.com/abu-arandas/arandastech
```

```bash
cd arandastech/agents/openmausbot
```

Look at the plan first. This changes nothing:

```bash
openmausbot team apply arandas-tech.team.yaml --dry-run
```

Then apply it:

```bash
openmausbot team apply arandas-tech.team.yaml
```

Running the same command again later updates the team to match the file and prints `No changes.` when nothing differs.

**Without the command line:** in the desktop app, open Teams, choose Import, and either pick `arandas-tech.md` from disk or paste its public address on GitHub. A review screen shows what will be created. Bots imported this way start at "Full access", so open the department's menu straight away, choose "Set for all bots in this department" and pick "Ask for approval".

### 3. Set the four safeguards

| # | Setting | Where | Value |
|---|---|---|---|
| 1 | Approval level | Each bot's settings, or the department menu | **Ask for approval** for every bot. The team file sets it. Check that it took. |
| 2 | Sending on your behalf | Each bot: Permissions | **Ask every time** for every bot. Set it by hand. |
| 3 | Computer | Each bot's settings | None to start. Give Engineering an isolated VM when it should write code. Avoid "this computer". |
| 4 | Connected apps | Plugins | One app at a time, and only for the departments that need it. |

### 4. Start

Open the Company room and give Operations a goal, for example:

> Prepare five posts for this week, identify three qualified leads, create a GitHub issue for the new checkout feature, and show me every action before anything is published or sent.

Operations should answer with a plan before anything happens, and every send or publish should come back to you as a request.

Turn on a routine only once its department has the connection it needs. All five arrive paused.

## What the rules rest on

Today the team's rules have two kinds of backing:

| Rule | Backed by |
|---|---|
| Commands and file edits need approval | OpenMausBot, through the "Ask for approval" level |
| Sends through connected apps need approval | OpenMausBot, through "Ask every time" |
| Everything else: action levels, the never-do list, outside content is data, money is counted honestly | Instructions the bots are given. Instructions guide a model. They do not bind it. |

The blueprint asks for more than instructions: approvals tied to the exact payload, spending limits, an append-only audit log and a ledger. That is the platform being built in this repository. When its MCP server is ready, add it in OpenMausBot under Plugins, MCP servers, Add server. The bots will then read business data and propose actions through it, and they will not be able to approve anything.

## What has and has not been checked

- `npm run agents:check` passes. It checks both files against the limits OpenMausBot documents: field lengths, keys, room members, one Chief of Staff, paused routines, and that no bot starts above "Ask for approval".
- **The team has not been applied to a running OpenMausBot.** That needs your computer and your sign-ins. Run the `--dry-run` command first and read its plan.

## Costs and cautions

- OpenMausBot is free and open source (Apache 2.0). Some services it can use are not free: its cloud computers are paid after a trial, and connected apps go through Composio, which has its own terms.
- Running bots on a personal subscription is OpenMausBot's design. Check your provider's terms before you leave routines running unattended.
- The Windows installer is not signed, so Windows shows an "unknown publisher" warning.
- OpenMausBot keeps some keys in a plain-text file on your computer. Do not paste a password or a key into a conversation.

## Changing the team

| To change | Edit | Then |
|---|---|---|
| A department's standing instructions | `souls/<department>.md` | Rebuild and apply |
| The rules every bot shares | `brief.md` | Rebuild and apply |
| A skill | `skills/<name>/SKILL.md` | Rebuild and apply |
| Bots, rooms, titles | `arandas-tech.team.yaml` | Rebuild and apply |
| Routines, colours, listing text | `build.mjs` | Rebuild |

Rebuild the one-file version from the repository root:

```bash
npm run agents:build
```

Then apply the team file again.
