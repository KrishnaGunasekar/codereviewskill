import { execFileSync, execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB
const MAX_DIFF_LINES = 8000;
const NULL_DEVICE = platform() === 'win32' ? 'NUL' : '/dev/null';

/**
 * Executes a shell command string and returns trimmed stdout.
 * Use only for commands with no user-controlled input.
 * Returns empty string on failure for graceful fallback chaining.
 */
function runCommand(command) {
    try {
        return execSync(command, {
            encoding: 'utf-8',
            maxBuffer: MAX_BUFFER,
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
    } catch (error) {
        if (error.stderr) {
            console.warn(`[krishna-csharp-pr-reviewer] Command warning: ${error.stderr.trim()}`);
        }
        return '';
    }
}

/**
 * Executes git with an explicit args array to avoid shell injection.
 * Safe for use with file paths that may contain spaces or special characters.
 */
function runGitSafe(args) {
    try {
        return execFileSync('git', args, {
            encoding: 'utf-8',
            maxBuffer: MAX_BUFFER,
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
    } catch (error) {
        // git diff --no-index exits with code 1 when files differ — capture stdout
        if (error.stdout) return error.stdout.trim();
        if (error.stderr) {
            console.warn(`[krishna-csharp-pr-reviewer] git warning: ${error.stderr.trim()}`);
        }
        return '';
    }
}

/**
 * Discovers untracked C# files (not ignored, not staged) and builds a
 * unified diff by comparing each against /dev/null.  This is the critical
 * fallback for repos with **no initial commit** where every file is untracked.
 *
 * Uses `git diff --no-index` which is a pure file-comparison mode that does
 * NOT require a commit history, making it safe for empty repos.
 * File paths are passed as args (not interpolated into a string) to prevent
 * shell injection from filenames containing spaces or special characters.
 */
function getUntrackedCsDiff() {
    const untrackedRaw = runCommand('git ls-files --others --exclude-standard -- "*.cs"');
    if (!untrackedRaw) return '';

    const files = untrackedRaw.split('\n').filter(Boolean);
    const diffs = [];

    for (const file of files) {
        const d = runGitSafe(['diff', '--no-index', '--no-color', '--', NULL_DEVICE, file]);
        if (d) diffs.push(d);
    }

    return diffs.join('\n');
}

/**
 * Generates synthetic diff stats for untracked C# files.
 * Counts total lines across all untracked .cs files.
 */
function getUntrackedCsStats() {
    const untrackedRaw = runCommand('git ls-files --others --exclude-standard -- "*.cs"');
    if (!untrackedRaw) return '';

    const files = untrackedRaw.split('\n').filter(Boolean);
    let totalInsertions = 0;

    for (const file of files) {
        try {
            const content = readFileSync(file, 'utf-8');
            totalInsertions += content.split('\n').length;
        } catch {
            // File may have been deleted between discovery and read
        }
    }

    return `${files.length} untracked file(s) | +${totalInsertions} lines (new, never committed)`;
}

/**
 * Retrieves the C# git diff using a prioritized fallback chain.
 * Returns both the diff content and a label describing which source was used,
 * so the LLM prompt can include accurate context about the diff origin.
 *
 * Priority:
 * 1. Staged changes (--cached) — ideal for pre-commit hooks
 * 2. All uncommitted changes vs HEAD
 * 3. Unstaged working tree changes only
 * 4. Untracked C# files (no commit history / fresh repo)
 *
 * @returns {{ diff: string, source: string, stats: string }}
 */
function getGitDiffWithSource() {
    // 1. Staged C# changes (pre-commit workflow)
    let diff = runCommand('git diff --cached --no-color -- "*.cs"');
    if (diff) {
        return {
            diff,
            source: 'staged changes (git diff --cached)',
            stats: runCommand('git diff --cached --stat --no-color -- "*.cs"')
        };
    }

    // 2. Uncommitted changes vs HEAD
    const hasHead = runCommand('git rev-parse HEAD');
    if (hasHead) {
        diff = runCommand('git diff HEAD --no-color -- "*.cs"');
        if (diff) {
            return {
                diff,
                source: 'all uncommitted changes vs HEAD (git diff HEAD)',
                stats: runCommand('git diff HEAD --stat --no-color -- "*.cs"')
            };
        }
    }

    // 3. Unstaged working tree changes (tracked files only)
    diff = runCommand('git diff --no-color -- "*.cs"');
    if (diff) {
        return {
            diff,
            source: 'unstaged working tree changes (git diff)',
            stats: runCommand('git diff --stat --no-color -- "*.cs"')
        };
    }

    // 4. Untracked C# files — essential for repos with no initial commit
    diff = getUntrackedCsDiff();
    if (diff) {
        return {
            diff,
            source: 'untracked files — no initial commit exists (git diff --no-index)',
            stats: getUntrackedCsStats()
        };
    }

    return { diff: '', source: 'none', stats: '' };
}

/**
 * Truncates the diff to MAX_DIFF_LINES and appends a clear notice
 * so the LLM knows the review is partial and which files were cut.
 */
function truncateDiff(diff) {
    const lines = diff.split('\n');
    if (lines.length <= MAX_DIFF_LINES) return { truncated: diff, wasTruncated: false };

    const kept = lines.slice(0, MAX_DIFF_LINES);

    // Find which files were cut by scanning remaining lines for diff headers
    const remaining = lines.slice(MAX_DIFF_LINES);
    const cutFiles = [...new Set(
        remaining
            .filter(l => l.startsWith('diff --git'))
            .map(l => l.replace('diff --git a/', '').split(' ')[0])
    )];

    const notice = [
        '',
        '--- DIFF TRUNCATED ---',
        `This diff was truncated at ${MAX_DIFF_LINES} lines (total: ${lines.length} lines).`,
        cutFiles.length > 0
            ? `The following files were NOT reviewed due to size:\n${cutFiles.map(f => `  - ${f}`).join('\n')}`
            : 'Some file hunks at the end of the diff were not included.',
        'Recommendation: Split this PR into smaller, focused changesets.',
        '--- END TRUNCATION NOTICE ---'
    ].join('\n');

    return { truncated: kept.join('\n') + notice, wasTruncated: true };
}

function main() {
    try {
        // Verify we are inside a valid git repository
        const isGitRepo = runCommand('git rev-parse --is-inside-work-tree') === 'true';
        if (!isGitRepo) {
            console.error("Error: Not inside a git repository. This skill requires a valid Git repository to analyze diffs.");
            process.exit(1);
        }

        const { diff: rawDiff, source: diffSource, stats: diffStats } = getGitDiffWithSource();

        if (!rawDiff) {
            console.log("No C# (.cs) file changes detected in staging, unstaged, HEAD, or untracked files. Nothing to review.");
            process.exit(0);
        }

        const lineCount = rawDiff.split('\n').length;
        const { truncated: diffOutput, wasTruncated } = truncateDiff(rawDiff);

        if (wasTruncated) {
            console.warn(
                `Warning: Diff is ${lineCount} lines — truncated to ${MAX_DIFF_LINES} lines. ` +
                `Some files were excluded. Consider reviewing smaller changesets.`
            );
        }

        // Read the SKILL.md for structured review instructions
        let skillInstructions = "";
        try {
            skillInstructions = readFileSync(join(__dirname, 'SKILL.md'), 'utf-8');
        } catch {
            // Fallback if SKILL.md is missing or unreadable
            skillInstructions = "Analyze the following C# diff for best practices, memory allocations, and missing tests. Strictly review only added (+) or modified lines.";
        }

        const finalPrompt = `=== AGENT SYSTEM INSTRUCTIONS ===
${skillInstructions}

=== DIFF METADATA ===
Diff source: ${diffSource}
Total lines in diff: ${lineCount}${wasTruncated ? ` (truncated to ${MAX_DIFF_LINES} — review is partial)` : ''}

=== DIFF STATISTICS ===
${diffStats || 'No statistics available.'}

=== TARGET C# GIT DIFF ===
Perform your review strictly based on the system instructions using the following git diff output:

\`\`\`diff
${diffOutput}
\`\`\`
`;

        // Output to stdout for the AI agent to consume
        console.log(finalPrompt);

    } catch (error) {
        console.error("Unexpected error in krishna-csharp-pr-reviewer skill:", error.message);
        process.exit(1);
    }
}

main();
