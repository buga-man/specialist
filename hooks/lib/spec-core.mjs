/**
 * spec-core.mjs — shared logic for the spec-gate hook.
 *
 * Used by the Claude Code hook (hooks/lib/spec-gate.mjs) and the pi extension
 * (extensions/spec-gate.ts). The contract it enforces:
 *
 *   - An active plan lives in docs/plans/*.md; a task is a "### Task ..." section
 *     (Russian "###  ..." headings are recognized as well).
 *   - A task is closed by an explicit "- Done: ..." line ("- :" / "- :"
 *     work too). Checkbox lines ("- [x] ...") are progress notes and never close a task.
 *   - A task's editable files are the backticked paths on its "- Files:" line
 *     ("- :" recognized too); glob patterns (e.g. "*.css" under a tree) are honored.
 *   - Edits to files outside the open tasks' file lists are a scope violation.
 *
 * The .spec-gate mode file is not exempt from the gate: with an open plan the agent
 * cannot change the gate mode without a plan task.
 *
 * Fail-safe: parsing problems never block work — an unparsable plan yields no
 * restrictions rather than false blocks.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

/** Mode file in the project root: "hard" forces the pipeline even without a plan,
 *  "fast" is soft for the file gate but changes process orientation (skill-gate blocks
 *  the stage skills, plan-context advertises the fast lane), "off" disables the gate. */
export function readMode(projectDir) {
  try {
    const p = join(projectDir, ".spec-gate");
    if (existsSync(p)) {
      const v = readFileSync(p, "utf8").trim().toLowerCase();
      if (v === "hard" || v === "off" || v === "fast") return v;
    }
  } catch {
    /* fall through to default */
  }
  return "soft";
}

/** Files the agent may always touch: documentation, specs, plans. The .spec-gate mode
 *  file is deliberately not exempt — with an open plan, changing the gate mode requires
 *  a plan task, so the agent cannot disable the gate silently. */
export function isAlwaysAllowed(relPath) {
  if (!relPath) return true;
  const norm = relPath.replace(/\\/g, "/");
  if (norm === "docs" || norm.startsWith("docs/")) return true;
  if (/\.md$/i.test(norm)) return true;
  return false;
}

/** Extracts the target file paths of an `apply_patch`-style tool payload (Codex sends
 *  edits this way: the tool_input carries the whole patch text rather than a file path).
 *  Recognizes the line-oriented patch format — "*** Add File: <path>", "*** Update File:
 *  <path>", "*** Delete File: <path>" and "*** Move to: <path>" renames — and returns a
 *  deduplicated list of paths to check. Returns null when the payload is not recognizable
 *  as a patch (unknown shape — the caller stays silent instead of guessing). */
export function applyPatchPaths(toolInput) {
  let text = null;
  if (typeof toolInput === "string") {
    text = toolInput;
  } else if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    if (typeof toolInput.file_path === "string" && toolInput.file_path) return [toolInput.file_path];
    const candidate = toolInput.input ?? toolInput.patch ?? toolInput.patch_text;
    if (typeof candidate === "string") text = candidate;
  }
  if (text === null) return null;
  if (!/^\*\*\* Begin Patch\b/m.test(text)) return null;
  const paths = new Set();
  for (const m of text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
    paths.add(m[1].trim().replace(/\\/g, "/").replace(/^\.\//, ""));
  }
  for (const m of text.matchAll(/^\*\*\* Move to: (.+)$/gm)) {
    paths.add(m[1].trim().replace(/\\/g, "/").replace(/^\.\//, ""));
  }
  return [...paths];
}

/** The file paths an edit payload touches: the explicit `file_path` of Claude Code-style
 *  tools, or every file of an apply_patch-style patch. Used by the PostToolUse adapters
 *  (formatter, linter, semgrep scan) that need the target files regardless of the host's
 *  edit shape. Unknown shapes yield an empty list; `cap` bounds the patch case. */
export function editedFilePaths(toolInput, cap = 5) {
  if (!toolInput || typeof toolInput !== "object") return [];
  const filePath = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof filePath === "string" && filePath) return [filePath];
  const patchPaths = applyPatchPaths(toolInput);
  if (!patchPaths) return [];
  return patchPaths.slice(0, cap);
}

/** Collect docs/plans/*.md and extract the file paths of all open (unticked) tasks.
 *  Also reports which plan files still have open work and the open tasks' titles —
 *  plan-context uses these to orient a fresh session; spec-gate ignores them. */
export function activePlanInfo(projectDir) {
  const result = {
    hasOpenTasks: false,
    openFiles: [],
    openPlans: [],
    openTaskTitles: [],
    openTaskCount: 0,
    // An open task has a "- Files:" line but no backticked paths could be parsed —
    // the plan is malformed, so its scope is unknown (see decide()).
    unparsedFiles: false,
  };
  const plansDir = join(projectDir, "docs", "plans");
  let files = [];
  try {
    if (!existsSync(plansDir)) return result;
    files = readdirSync(plansDir).filter((f) => f.toLowerCase().endsWith(".md")).sort();
  } catch {
    return result;
  }
  const openFiles = new Set();
  const openPlans = new Set();
  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(plansDir, f), "utf8");
    } catch {
      continue;
    }
    let inTask = false;
    let taskOpen = false;
    let taskHasFilesLine = false;
    let taskFiles = [];
    let taskTitle = "";
    const flush = () => {
      if (inTask && taskOpen) {
        result.hasOpenTasks = true;
        result.openTaskCount++;
        openPlans.add(f);
        result.openTaskTitles.push(taskTitle || "(untitled task)");
        for (const p of taskFiles) openFiles.add(p);
        if (taskHasFilesLine && taskFiles.length === 0) result.unparsedFiles = true;
      }
      inTask = false;
      taskOpen = false;
      taskHasFilesLine = false;
      taskFiles = [];
      taskTitle = "";
    };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (/^#{2,4}\s+(?:task\b|)/i.test(line)) {
        flush();
        inTask = true;
        taskOpen = true;
        taskTitle = line.replace(/^#{2,4}\s+/, "").trim();
        continue;
      }
      if (!inTask) continue;
      if (/^#{1,4}\s+/.test(line)) {
        flush(); // another section header — the task ended
        continue;
      }
      if (!/^[-*+]\s/.test(line.trim())) continue;
      const bullet = line.trim().toLowerCase().replace(/^[-*+]+\s*/, "");
      // Closure is the explicit marker ("- Done: <commit>"); "- [x]" checkboxes are
      // progress notes and never close a task.
      if (/^(?:done||)\s*[:—]/.test(bullet.replace(/^\[x\]\s*/i, ""))) {
        taskOpen = false; // files of a closed task are no longer editable
        continue;
      }
      if (/^(?:files|?)\s*:/i.test(bullet)) {
        taskHasFilesLine = true;
        for (const m of line.matchAll(/`([^`]+)`/g)) {
          taskFiles.push(m[1].trim().replace(/\\/g, "/").replace(/^\.\//, ""));
        }
      }
    }
    flush();
  }
  result.openFiles = [...openFiles];
  result.openPlans = [...openPlans];
  return result;
}

const CASE_INSENSITIVE = process.platform === "win32";

/** Minimal glob support for "- Files:" entries: a double-star crosses directories
 *  (with a trailing slash it also matches zero directories), a single star stays
 *  within one directory, "?" is a single char. */
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        re += "(?:.*/)?";
        i++;
      } else {
        re += ".*";
      }
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, CASE_INSENSITIVE ? "i" : "");
}

function pathMatches(target, listed) {
  if (/[*?]/.test(listed)) return globToRegExp(listed).test(target);
  const t = CASE_INSENSITIVE ? target.toLowerCase() : target;
  const l = CASE_INSENSITIVE ? listed.toLowerCase() : listed;
  // Exact match, or a suffix of either side — the plan may spell paths relative to a
  // monorepo sub-directory while the edit arrives relative to the repo root.
  return t === l || t.endsWith("/" + l) || l.endsWith("/" + t);
}

/**
 * Decide whether editing filePath is allowed in projectDir under the given mode.
 * Returns { action: "allow" } or { action: "block", reason }.
 */
export function decide({ projectDir, filePath, mode }) {
  if (mode === "off") return { action: "allow" };
  let rel;
  try {
    rel = isAbsolute(filePath) ? relative(projectDir, filePath) : filePath;
  } catch {
    return { action: "allow" };
  }
  const relNorm = rel.replace(/\\/g, "/");
  if (!relNorm || relNorm.startsWith("..") || isAbsolute(relNorm)) return { action: "allow" }; // outside the project — not our concern
  if (isAlwaysAllowed(relNorm)) return { action: "allow" };

  const info = activePlanInfo(projectDir);
  if (info.hasOpenTasks) {
    if (info.openFiles.length > 0 && info.openFiles.some((f) => pathMatches(relNorm, f))) {
      return { action: "allow" };
    }
    if (info.openFiles.length === 0) {
      if (info.unparsedFiles) {
        // A "- Files:" line exists but yields no paths — almost always missing backticks
        // or a "*" bullet. Failing open here silently disables the whole gate, so say so.
        return {
          action: "block",
          reason:
            "spec-gate: an open task in docs/plans/ has a `- Files:` line with no backticked " +
            'paths, so its scope cannot be determined. The gate is off until this is fixed. ' +
            'Format the line as `- Files: `path/one.ts`, `path/two.ts`` — backticks and a "- " bullet ' +
            'are required, and the line must come before any "- Done:" marker.',
        };
      }
      // No "- Files:" line at all — fail safe (nothing to enforce).
      return { action: "allow" };
    }
    return {
      action: "block",
      reason:
        `spec-gate: "${relNorm}" is not in the file list of any open task in docs/plans/. ` +
        "Going outside the plan is scope creep. Either this work belongs to the feature — " +
        "update the implementation plan (add the file to the proper task) and mark tasks done " +
        "with a `- Done:` line as you finish them — or stop and discuss the change with the user. " +
        "Docs/specs/plan files are always allowed.",
    };
  }
  if (mode === "hard") {
    return {
      action: "block",
      reason:
        "spec-gate (hard mode): no active plan in docs/plans/. " +
        "Code edits are blocked until the spec pipeline produces one: brainstorm → system-thinking → " +
        "decompositor → implementation-plan. Docs (docs/specs, docs/plans, *.md) stay editable. " +
        "To disable the gate, ask the user to set .spec-gate to \"soft\" (or delete the file) — " +
        "the agent cannot change the gate mode itself.",
    };
  }
  return { action: "allow" };
}
