import { execSync } from 'child_process';
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
 * Executes a shell command and returns trimmed stdout.
 * Logs stderr warnings instead of silently swallowing them.
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
 * Discovers untracked C# files (not ignored, not staged) and builds a
 * unified diff by comparing each against /dev/null.  This is the critical
 * fallback for repos with **no initial commit** where every file is untracked.
 *
 * Uses `git diff --no-index` which is a pure file-comparison mode that does
 * NOT require a commit history, making it safe for empty repos.
 */
function getUntrackedCsDiff() {
    const untrackedRaw = runCommand('git ls-files --others --exclude-standard -- "*.cs"');
    if (!untrackedRaw) return '';

    const files = untrackedRaw.split('\n').filter(Boolean);
    const diffs = [];

    for (const file of files) {
        // --no-index exits with code 1 when files differ, which execSync treats
        // as an error. We catch it and still capture the valid diff output.
        try {
            const d = execSync(
                `git diff --no-index --no-color -- ${NULL_DEVICE} "${file}"`,
                { encoding: 'utf-8', maxBuffer: MAX_BUFFER, stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim();
            if (d) diffs.push(d);
        } catch (error) {
            // git diff --no-index returns exit code 1 when files differ — this is expected
            if (error.stdout) {
                const d = error.stdout.trim();
                if (d) diffs.push(d);
            }
        }
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
 * Retrieves the C# git diff using a prioritized fallback chain:
 * 1. Staged changes (--cached) — ideal for pre-commit hooks
 * 2. All uncommitted changes vs HEAD
 * 3. Unstaged working tree changes only
 * 4. Untracked C# files (no commit history / fresh repo)
 */
function getGitDiff() {
    // 1. Staged C# changes (pre-commit workflow)
    let diff = runCommand('git diff --cached --no-color -- "*.cs"');

    // 2. Uncommitted changes vs HEAD
    if (!diff) {
        // Verify HEAD exists before diffing against it (fails on initial commit)
        const hasHead = runCommand('git rev-parse HEAD');
        if (hasHead) {
            diff = runCommand('git diff HEAD --no-color -- "*.cs"');
        }
    }

    // 3. Unstaged working tree changes (tracked files only)
    if (!diff) {
        diff = runCommand('git diff --no-color -- "*.cs"');
    }

    // 4. Untracked C# files — essential for repos with no initial commit
    if (!diff) {
        diff = getUntrackedCsDiff();
    }

    return diff;
}

/**
 * Retrieves diff statistics (files changed, insertions, deletions)
 * matching the same fallback chain as getGitDiff().
 */
function getDiffStats() {
    const stats = runCommand('git diff --cached --stat --no-color -- "*.cs"')
        || runCommand('git diff HEAD --stat --no-color -- "*.cs"')
        || runCommand('git diff --stat --no-color -- "*.cs"')
        || getUntrackedCsStats();
    return stats;
}

function main() {
    try {
        // Verify we are inside a valid git repository
        const isGitRepo = runCommand('git rev-parse --is-inside-work-tree') === 'true';
        if (!isGitRepo) {
            console.error("Error: Not inside a git repository. This skill requires a valid Git repository to analyze diffs.");
            process.exit(1);
        }

        const diffOutput = getGitDiff();

        if (!diffOutput) {
            console.log("No C# (.cs) file changes detected in staging, unstaged, HEAD, or untracked files. Nothing to review.");
            process.exit(0);
        }

        // Guard against oversized diffs that would exceed LLM context windows
        const lineCount = diffOutput.split('\n').length;
        if (lineCount > MAX_DIFF_LINES) {
            console.warn(
                `Warning: Diff is ${lineCount} lines (threshold: ${MAX_DIFF_LINES}). ` +
                `Output may exceed LLM context window. Consider reviewing smaller changesets.`
            );
        }

        const diffStats = getDiffStats();

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
