# Poker Duel & Card Arena - Agent Workspace Instructions

This document provides persistent context, credentials, database IDs, and workflow protocols for AI agents interacting with this repository.

---

## 1. Notion Integration & Token

- **Notion Integration Token**: `[REDACTED_NOTION_TOKEN]`
- **Notion API Version**: `2022-06-28`
- **API Base URL**: `https://api.notion.com/v1`

---

## 2. Connected Notion Databases

### A. Glitch Tracking & Harmonization Board
- **Database ID**: `3d40814c-194d-818b-b382-f04b0f81c76b`
- **Direct URL**: `https://app.notion.com/p/3d40814c194d818bb382f04b0f81c76b`
- **Purpose**: Single source of truth for all system anomalies and glitch resolution tracking.
- **Properties**:
  - `Glitch / Anomaly` (title)
  - `Status` (select): `Identified`, `Replicating`, `Patching`, `Resolved`
  - `Priority` (select): `Low`, `Medium`, `High`, `Critical`
  - `Component` (select): `Poker Duel`, `Crazy Eights`, `Go Fish`, `Spades Duel`, `P2P Multiplayer`, `UI & Theme`
  - `Reproduction Steps` (rich_text)
  - `Harmonization Summary` (rich_text)

### B. Master Implementation Plan & Roadmap Board
- **Database ID**: `3d40814c-194d-81da-a640-c3025f778704`
- **Direct URL**: `https://app.notion.com/p/3d40814c194d81daa640c3025f778704`
- **Purpose**: Tracks the full lifecycle roadmap across Where We've Been (Delivered), Where We're At (Active), and Where We Plan to Go (Scheduled / Proposed).
- **Properties**:
  - `Milestone / Feature` (title)
  - `Phase / Horizon` (select): `Where We've Been`, `Where We're At`, `Where We Plan to Go`, `Future Backlog & Ideas`
  - `Status` (select): `Delivered`, `Active`, `Scheduled`, `Proposed`
  - `Component / Domain` (select): `Core Poker Engine`, `Expanded Games`, `AI & DadBot`, `Multiplayer & Networking`, `Audio & Visual Themes`, `Infrastructure & Quality`
  - `Target Version` (select): `v1.0 - Foundation`, `v1.1 - Multi-Game Suite`, `v1.2 - Polish & Resilience`, `v2.0 - Community & Expansions`
### C. QA Test Runs & Release Handoffs Board
- **Database ID**: `3d60814c-194d-8172-9214-f2efbc907d59`
- **Direct URL**: `https://app.notion.com/p/3d60814c194d81729214f2efbc907d59`
- **Purpose**: Tracks release candidate builds, QA verification tasks, test verdicts, and sign-offs for merging to `main`.
- **Properties**:
  - `Release Candidate` (title)
  - `Branch` (select): `testing`, `develop`, `main`
  - `QA Status` (select): `Ready for QA`, `In Testing`, `Approved for Main`, `Needs Harmonization`, `Deployed to Production`
  - `Commit SHA` (rich_text)
  - `Priority Verification Items` (rich_text)
  - `QA Tester Notes & Sign-Off` (rich_text)

---

## 3. Operating Philosophy & Lexicon Rules

1. **Pacifist Lexicon**: Strictly avoid adversarial or destructive terms in all logs, commits, code comments, and Notion updates.
   - ❌ *Do NOT use*: "kill", "squash", "destroy", "attack", "bug hunt"
   - ✅ *DO use*: "resolve", "repair", "patch", "balance", "harmonize", "restore flow"
2. **Single Source of Truth**: Before initiating any anomaly modification, query the Notion Glitch Tracking database to prevent duplicates.
3. **Harmonization State Machine**: Transition status through `Identified` ➔ `Replicating` ➔ `Patching` ➔ `Resolved`.

---

## 4. Notion Quick-Access Scripts (PowerShell)

### Query Glitches
```powershell
$headers = @{
    "Authorization" = "Bearer [REDACTED_NOTION_TOKEN]"
    "Notion-Version" = "2022-06-28"
    "Content-Type" = "application/json"
}
$res = Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/3d40814c-194d-818b-b382-f04b0f81c76b/query" -Method Post -Headers $headers -Body "{}"
$res.results | ForEach-Object { [PSCustomObject]@{ Title = $_.properties.'Glitch / Anomaly'.title[0].plain_text; Status = $_.properties.Status.select.name } }
```

### Query Master Roadmap
```powershell
$headers = @{
    "Authorization" = "Bearer [REDACTED_NOTION_TOKEN]"
    "Notion-Version" = "2022-06-28"
    "Content-Type" = "application/json"
}
$res = Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/3d40814c-194d-81da-a640-c3025f778704/query" -Method Post -Headers $headers -Body "{}"
$res.results | ForEach-Object { [PSCustomObject]@{ Milestone = $_.properties.'Milestone / Feature'.title[0].plain_text; Phase = $_.properties.'Phase / Horizon'.select.name; Status = $_.properties.Status.select.name } }
```

---

## 5. Autonomous Engineering Standards

### Modular Architecture & Encapsulation
- **Single Responsibility**: Never create monolithic or "God" classes/files.
- **File Size Constraints**:
  - *Target*: Keep source code files under 250 lines.
  - *Tolerance*: A 20% buffer (up to 300 lines maximum) is permitted only when breaking a file apart would introduce artificial fragmentation or harm readability.
  - *Hard Ceiling*: Files exceeding 300 lines must be refactored and extracted into sub-components, helper utilities, or dedicated service modules before proceeding.
- **Separation of Concerns**: Maintain strict boundaries between UI components, state management, and core game/domain logic.

### Project Tracking & Notion Integration
- When initiating any new application or major feature, establish a tracking page/entry in Notion.
- Outline the initial module architecture, milestones, and task checklists before writing implementation code, and update status as milestones clear.

### Version Control & Persistence
- Commit and push working changes incrementally upon completing any self-contained module, bug fix, or refactor.
- Ensure the working tree is clean and pushed before concluding a task session.

### Global Security & Secret Containment Directive
- **Zero-Exposure Mandate**: Agents must never commit, push, or write active credentials into any version-controlled space, public or private.
- **Credential Definition**: This applies to all authentication strings, including Notion integration tokens, GitHub Personal Access Tokens (PATs), API keys, database URIs, and OAuth secrets.
- **Strict Isolation**: All active credentials must remain localized entirely within .env files or a designated secure environment variable manager. Before executing any Git commit, agents must independently verify that the .env file is explicitly listed in .gitignore.
- **Placeholder Substitution**: When generating setup instructions, documentation, or rule files (e.g., inside .agents/rules/), agents must proactively replace all real tokens with generic syntax (e.g., [REDACTED_NOTION_TOKEN]).

