# codereviewskill

A collection of AI Agent Skills for VS Code, built for the `formulahendry.agent-skills` extension.

## Available Skills

| Skill | Description |
|-------|-------------|
| [krishna-csharp-pr-reviewer](./skills/krishna-csharp-pr-reviewer/) | Enterprise-grade C# PR reviewer that analyzes git diffs for clean architecture, allocations, concurrency risks, security vulnerabilities, and missing unit test coverage. |

## Quick Start

### For Users

1. Install the **Agent Skills** extension in VS Code (`formulahendry.agent-skills`).
2. Open **Settings** (`Ctrl + ,`) → search for `agentSkills.skillRepositories`.
3. Add this repository:
   ```json
   {
       "owner": "KrishnaGunasekar",
       "repo": "codereviewskill",
       "path": "skills",
       "branch": "main"
   }
   ```
4. Open the **Agent Skills** panel → **Marketplace** tab → Install `krishna-csharp-pr-reviewer`.

### For Developers

```bash
git clone https://github.com/KrishnaGunasekar/codereviewskill.git
cd codereviewskill/skills/krishna-csharp-pr-reviewer
node index.js
```

## Repository Structure

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

## License

MIT
