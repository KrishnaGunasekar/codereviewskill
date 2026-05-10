# Krishna C# PR Reviewer & Test Gap Analyzer

An enterprise-grade Agent Skill conforming to the VS Code `formulahendry.agent-skills` specification. It provides AI coding assistants with the ability to fetch the current Git diff for C# files and rigorously review them for clean architecture, performance issues, security vulnerabilities, and missing test coverage.

## Overview

The `krishna-csharp-pr-reviewer` skill fetches the current workspace's Git diff specifically for `.cs` files (prioritizing staged changes, falling back to `HEAD` or unstaged) and wraps it in a highly structured set of system prompts. This instructs the LLM to act as an Enterprise C# Principal Engineer, explicitly focusing on newly added lines (`+`) and identifying:

- Memory allocations and performance anti-patterns.
- Concurrency risks (`async/await` best practices).
- Security vulnerabilities (hardcoded secrets, SQL injection, insecure deserialization).
- Nullable reference type misuse.
- Resource management issues (`IDisposable` / `IAsyncDisposable`).
- Code architecture and modern C# idioms.
- Missing unit test matrices for newly added logic.

## How It Works

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Git Repository  │────▶│   index.js   │────▶│   AI Assistant  │
│  (your .cs code) │     │  (this skill)│     │  (LLM via chat) │
└─────────────────┘     └──────────────┘     └─────────────────┘
        │                       │                       │
   git diff --cached       Captures diff          Receives diff +
   or git diff HEAD        + reads SKILL.md       SKILL.md prompt
                           + outputs to stdout    → produces review
```

1. **`index.js`** runs `git diff` commands to capture C# file changes (staged → HEAD → unstaged fallback chain).
2. It reads `SKILL.md` which contains the structured review instructions and criteria.
3. The combined prompt (instructions + diff + statistics) is printed to stdout.
4. The AI assistant consumes this output and produces a formatted code review with an executive summary, categorized issues, and a missing unit test matrix.

## Prerequisites

- **Node.js** v18 or higher (LTS recommended)
- **Git** (must be run inside a valid Git repository)
- **VS Code Agent Skills Extension** (e.g., `formulahendry.agent-skills` or similar LLM workspace integration)

## Installation

### Option 1: Via Agent Skills Marketplace

1. Open VS Code and install the **Agent Skills** extension (`formulahendry.agent-skills`).
2. Open VS Code **Settings** (`Ctrl + ,`) and search for **"Agent Skills"**.
3. Under `agentSkills.skillRepositories`, add:
   ```json
   {
       "owner": "KrishnaGunasekar",
       "repo": "codereviewskill",
       "path": "skills",
       "branch": "main"
   }
   ```
4. Open the **Agent Skills** panel from the Activity Bar → **Marketplace** tab.
5. Find `krishna-csharp-pr-reviewer` and click **Install**.

### Option 2: Repository Skills Directory

Copy the skill files directly into your C# project repository:

```bash
# From your repository root
mkdir -p .github/skills/krishna-csharp-pr-reviewer
cp SKILL.md package.json index.js README.md .github/skills/krishna-csharp-pr-reviewer/
```

### Option 3: Personal / Global Installation

Make the skill available across all your projects:

```bash
# Windows
mkdir %USERPROFILE%\.copilot\skills\krishna-csharp-pr-reviewer
copy SKILL.md package.json index.js README.md %USERPROFILE%\.copilot\skills\krishna-csharp-pr-reviewer\
```

> **Note:** This skill uses only native Node.js libraries — no `npm install` is required.

## Usage Examples

Once installed, trigger the skill through your VS Code AI Assistant (GitHub Copilot Chat, Claude, etc.) by referencing the skill name:

**Example Prompts:**

```text
@workspace run the krishna-csharp-pr-reviewer skill on my current changes.
```

```text
Trigger krishna-csharp-pr-reviewer to check my staged changes before I commit.
```

```text
Use the krishna-csharp-pr-reviewer skill to identify any missing unit tests in my latest C# refactoring.
```

**Direct CLI execution:**

```bash
node index.js
```

The skill will automatically fetch the C# diff, include diff statistics, and pipe everything along with the `SKILL.md` instructions to the AI assistant for processing.

<details>
<summary><strong>Sample Output</strong> (click to expand)</summary>

### Executive Summary
The changes introduce a new `OrderService` with proper DI but contain a critical blocking async call and a missing dispose pattern. Test coverage for the new branching logic is absent.

### Code Review Comments

**🔴 Critical**

**File:** `Services/OrderService.cs` — `ProcessOrderAsync`
Blocking call `.Result` on an async method risks deadlocks.
```csharp
// ✅ Fix
var result = await _repository.GetOrderAsync(id).ConfigureAwait(false);
```

**🟡 Warning**

**File:** `Services/OrderService.cs` — `BuildReport`
String concatenation in a loop creates excessive allocations. Use `StringBuilder`.

### Missing Unit Test Matrix

| File | Method/Branch | Test Scenario Required | Priority |
|------|--------------|----------------------|----------|
| `OrderService.cs` | `ProcessOrderAsync` — null order | Verify `ArgumentNullException` thrown | High |
| `OrderService.cs` | `BuildReport` — empty lines | Verify returns empty string | Medium |

</details>

## Configuration

The skill currently uses sensible defaults. The following constants in `index.js` can be adjusted:

| Constant | Default | Description |
|----------|---------|-------------|
| `MAX_BUFFER` | `10 MB` | Maximum buffer size for `execSync` to handle large diffs |
| `MAX_DIFF_LINES` | `8000` | Warn threshold when diff size may exceed LLM context windows |

## Limitations

- **C# files only:** The skill filters diffs to `*.cs` files. Other file types (`.csproj`, `.razor`, `.xaml`) are not analyzed.
- **No test execution:** The skill identifies *missing* tests but does not run or validate existing tests.
- **Context window limits:** Very large diffs (8,000+ lines) may exceed LLM context windows, producing incomplete reviews. The skill warns when this threshold is exceeded.
- **No cross-file analysis:** Each diff hunk is reviewed in isolation. The skill cannot trace dependencies across files not present in the diff.
- **Git required:** The skill must be executed inside a valid Git repository with at least one commit (or staged changes).

## License

MIT
