# Poker Duel & Card Arena - Agent Workspace Instructions

This document provides persistent context, credentials, database IDs, and workflow protocols for AI agents interacting with this repository.

---

## 1. Notion Integration & Token

- **Notion Integration Token**: `ntn_p21692480771Wi3C5uhECNhEFPNUFZIvMsxZ0rQC3ovdAa`
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
    "Authorization" = "Bearer ntn_p21692480771Wi3C5uhECNhEFPNUFZIvMsxZ0rQC3ovdAa"
    "Notion-Version" = "2022-06-28"
    "Content-Type" = "application/json"
}
$res = Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/3d40814c-194d-818b-b382-f04b0f81c76b/query" -Method Post -Headers $headers -Body "{}"
$res.results | ForEach-Object { [PSCustomObject]@{ Title = $_.properties.'Glitch / Anomaly'.title[0].plain_text; Status = $_.properties.Status.select.name } }
```

### Query Master Roadmap
```powershell
$headers = @{
    "Authorization" = "Bearer ntn_p21692480771Wi3C5uhECNhEFPNUFZIvMsxZ0rQC3ovdAa"
    "Notion-Version" = "2022-06-28"
    "Content-Type" = "application/json"
}
$res = Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/3d40814c-194d-81da-a640-c3025f778704/query" -Method Post -Headers $headers -Body "{}"
$res.results | ForEach-Object { [PSCustomObject]@{ Milestone = $_.properties.'Milestone / Feature'.title[0].plain_text; Phase = $_.properties.'Phase / Horizon'.select.name; Status = $_.properties.Status.select.name } }
```
