# Krishna C# PR Reviewer Skill

An enterprise-grade C# code review skill for VS Code, powered by AI Agent Skills. Analyzes git diffs for clean architecture, memory allocations, concurrency risks, security vulnerabilities, and generates an exhaustive missing unit test matrix.

## Features

- 🔍 **Deep C# Analysis** — Detects anti-patterns, memory leaks, `async` misuse, and security vulnerabilities
- 🧪 **Missing Unit Test Matrix** — Automatically identifies untested branches and generates a test gap report
- 🛡️ **Security Scanning** — Flags hardcoded credentials, SQL injection risks, and insecure deserialization
- ⚡ **Modern .NET Idioms** — Suggests C# 12+ patterns (`Span<T>`, primary constructors, collection expressions)
- 📊 **Diff Statistics** — Provides file count, insertions, and deletions summary
- 🆕 **Fresh Repo Support** — Works on repos with no initial commit (untracked file detection)

## Quick Setup (VS Code Agent Skills Extension)

### Prerequisites

- [VS Code](https://code.visualstudio.com/) (v1.96 or later)
- [Agent Skills Extension](https://marketplace.visualstudio.com/items?itemName=formulahendry.agent-skills) installed
- A Git-initialized repository with `.cs` files

### Step 1 — Add the Skill Repository

1. Open **Settings** in VS Code (`Ctrl + ,`)
2. Search for `agentSkills.skillRepositories`
3. Click **Edit in settings.json** and add:

```json
{
    "agentSkills.skillRepositories": [
        {
            "owner": "KrishnaGunasekar",
            "repo": "codereviewskill",
            "path": "skills",
            "branch": "main"
        }
    ]
}
```

### Step 2 — Install the Skill

1. Reload VS Code (`Ctrl + Shift + P` → `Developer: Reload Window`)
2. Open the **Agent Skills** panel in the Activity Bar
3. Go to the **Marketplace** tab
4. Find **"Krishna C# PR Reviewer"** → Click **Install**

### Step 3 — Use the Skill

1. Open any Git repository containing C# (`.cs`) files
2. Make changes to your C# code (staged, unstaged, or even untracked files)
3. Open **Copilot Chat** (`Ctrl + Shift + I`)
4. Invoke the skill:

```
@skills /krishna-csharp-pr-reviewer
```

The skill will analyze your C# git diff and return:
- **Executive Summary** of code health
- **Code Review Comments** grouped by severity (🔴 Critical, 🟡 Warning, 🔵 Nitpick)
- **Missing Unit Test Matrix** with test scenarios and priority

## How It Works

The skill uses a 4-step fallback chain to detect C# changes in any repo state:

| Priority | Method | Scenario |
|----------|--------|----------|
| 1 | `git diff --cached` | Staged changes (pre-commit workflow) |
| 2 | `git diff HEAD` | All uncommitted changes vs last commit |
| 3 | `git diff` | Unstaged working tree changes (tracked files) |
| 4 | `git ls-files --others` + `git diff --no-index` | **Untracked files (no initial commit)** |

## Updating the Skill

When the skill is updated on GitHub, refresh it in VS Code:

1. Open **Agent Skills** panel → **Installed** tab
2. Click the **Refresh** icon, or:
   - `Ctrl + Shift + P` → `Developer: Reload Window`
3. The extension will pull the latest version from the repository

## For Developers

### Local Testing

```bash
git clone https://github.com/KrishnaGunasekar/codereviewskill.git
cd codereviewskill/skills/krishna-csharp-pr-reviewer
npm install
```

Run the skill against any C# repo:

```bash
cd /path/to/your/csharp-repo
node /path/to/codereviewskill/skills/krishna-csharp-pr-reviewer/index.js
```

### Repository Structure

```
codereviewskill/
├── skills/
│   └── krishna-csharp-pr-reviewer/
│       ├── SKILL.md         # AI review instructions & criteria
│       ├── package.json     # Skill metadata & entry point
│       ├── index.js         # Git diff extraction logic
│       └── README.md        # Skill documentation
├── README.md                # This file
├── LICENSE                  # MIT License
└── .gitignore
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Skill not appearing in Marketplace | Verify `agentSkills.skillRepositories` is set correctly in settings.json, then reload VS Code |
| "No C# file changes detected" | Ensure your repo has `.cs` files that are modified, staged, or untracked |
| "Not inside a git repository" | Run `git init` in your project directory first |
| Diff output too large | The skill warns at 8000+ lines. Review smaller changesets or commit in batches |
| Skill not picking up untracked files | Ensure files are not in `.gitignore`. The skill respects `.gitignore` exclusions |

## License

MIT
