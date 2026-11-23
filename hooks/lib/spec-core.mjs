/**
 * spec-core.mjs — shared logic for the spec-gate hook.
 *
 * Used by the Claude Code hook (hooks/lib/spec-gate.mjs) and the pi extension
 * (extensions/spec-gate.ts). The contract it enforces:
 *
 *   - An active plan lives in docs/plans/*.md; a task is a "### Task ..." section.
 *   - A task is closed by an explicit "- Done: ..." line. Checkbox lines ("- [x] ...")
 *     are progress notes and never close a task.
 *   - A task's editable files are the backticked paths on its "- Files:" line and the
 *     line's continuation (a wrapped Files list is one scope line); glob patterns
 *     (e.g. "*.css" under a tree) are honored.
 *   - Edits to files outside the open tasks' file lists are a scope violation.
 *   - The markers are English-only; the prose around them is the team's language.
 *
 * The .spec-gate mode file is not exempt from the gate: with an open plan the agent
 * cannot change the gate mode without a plan task.
 *
 * Fail-safe: parsing problems never block work — an unparsable plan yields no
 * restrictions rather than false blocks.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

/** Config file `.spec-gate` in the project root. Two formats:
 *   - legacy — one bare word, the mode: "hard" forces the pipeline even without a plan,
 *     "fast" is soft for the file gate but changes process orientation (skill-gate
 *     blocks the stage skills, plan-context advertises the fast lane), "off" disables
 *     the gate, anything else reads as the default "soft";
 *   - line-based — `mode: <soft|hard|fast|off>`, `role: <analyst|dev|qa>`, and
 *     `mutation-guard: on|off` directives, one per line, blank lines and "#"
 *     comments allowed. `role` pins the session to one role plugin: skill-gate then
 *     blocks the other roles' skills until the user consents to a switch (the
 *     dispatch protocol). `mutation-guard: on` opts the project into mutation-guard:
 *     agent-run pushes and history rewrites are blocked (outward mutations run on
 *     the user's explicit command); null/false when unset.
 *  Unknown keys and values are ignored — the file never turns restrictive by accident. */
const GATE_MODES = new Set(["soft", "hard", "fast", "off"]);

/** Reads the whole .spec-gate config: { mode, role, mutationGuard }. Fail-safe: a
 *  missing or unparsable file is the defaults, never a restriction. */
export function readGateConfig(projectDir) {
  let mode = "soft";
  let role = null;
  let mutationGuard = false;
  try {
    const p = join(projectDir, ".spec-gate");
    if (existsSync(p)) {
      for (let line of readFileSync(p, "utf8").split(/\r?\n/)) {
        line = line.trim().toLowerCase();
        if (!line || line.startsWith("#")) continue;
        const m = line.match(/^([a-z-]+):\s*(\S+)$/);
        if (m) {
          if (m[1] === "mode" && GATE_MODES.has(m[2])) mode = m[2];
          else if (m[1] === "role" && /^[a-z][a-z-]*$/.test(m[2])) role = m[2];
          else if (m[1] === "mutation-guard") mutationGuard = m[2] === "on";
          continue;
        }
        if (GATE_MODES.has(line) && line !== "soft") mode = line; // legacy bare word
      }
    }
  } catch {
    /* fall through to the defaults */
  }
  return { mode, role, mutationGuard };
}

/** The gate mode alone — spec-gate and plan-context orient by it. */
export function readMode(projectDir) {
  return readGateConfig(projectDir).mode;
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
    const candidate = toolInput.input ?? toolInput.patch ?? toolInput.patch_text ?? toolInput.patchText;
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
 *  tools (OpenCode calls it `filePath` and may prefix a `@` — both handled), or every
 *  file of an apply_patch-style patch. Used by the PostToolUse adapters (formatter,
 *  linter, semgrep scan) that need the target files regardless of the host's edit shape.
 *  Unknown shapes yield an empty list; `cap` bounds the patch case (a silently truncated
 *  scan is worse on huge patches than no cap — the cap only guards absurd payloads). */
export function editedFilePaths(toolInput, cap = 20) {
  if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    const filePath = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.filePath;
    if (typeof filePath === "string" && filePath) return [filePath.replace(/^@/, "")];
  }
  const patchPaths = applyPatchPaths(toolInput);
  if (!patchPaths) return [];
  return patchPaths.slice(0, cap).map((p) => p.replace(/^@/, ""));
}

/** The plan's frontmatter carries `status: approved` — the user's approval that opens
 *  code edits. Quoted values and trailing comments read as not-approved (conservative:
 *  the gate blocks rather than opens on an ambiguous status). */
function planIsApproved(text) {
  const fm = String(text ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false;
  const status = fm[1].match(/^status:\s*(\S[^\r\n]*)$/m);
  return !!status && status[1].trim().toLowerCase() === "approved";
}

/** The committed version of a file — `git show HEAD:<path>` — or null when git cannot
 *  answer (untracked, no commits yet, not a repo, no git). Never throws. */
function committedText(projectDir, rel) {
  try {
    const r = spawnSync("git", ["-C", projectDir, "show", `HEAD:./${rel}`], {
      encoding: "utf8",
      windowsHide: true,
    });
    return !r.error && r.status === 0 && typeof r.stdout === "string" ? r.stdout : null;
  } catch {
    return null;
  }
}

/** A whole-file Write of a plan whose content carries `status: approved` while the
 *  committed version does not (or does not exist) — the flip an Edit's old/new delta
 *  would have shown, taken through the Write route no delta covers. No projectDir or
 *  silent git → no flip claimed (fail-safe: the note is advisory, silence is safe). */
function writesApprovalFlip(path, content, projectDir) {
  if (!projectDir || !planIsApproved(content)) return false;
  let rel;
  try {
    rel = isAbsolute(path) ? relative(projectDir, path) : path;
  } catch {
    return false;
  }
  rel = rel.replace(/\\/g, "/");
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return false; // outside the project — not this gate's plan
  const committed = committedText(projectDir, rel);
  return committed === null || !planIsApproved(committed);
}

const STATUS_FLIP_NOTE =
  "spec-gate: the approval status of a plan in docs/plans/ was just edited — what the " +
  "gate authorizes changes with it. `status: approved` opens code edits, and only the " +
  "user's approval puts it there. If this was not the user's decision, revert the " +
  "edit; the change is visible in the plan's git diff.";

/** The visibility notes when an edit touches the gates' own boundaries: a "- Files:"
 *  scope line of a plan in docs/plans/, the plan's approval status, or one of the guard
 *  allowlists (.secrets-allow / .vuln-allow). The gates are discipline, not walls —
 *  the agent may edit a plan or an allowlist — but a boundary change must be seen, not
 *  pass silently: each note names what changed and points at the git diff where the
 *  change is reviewable. Returns string[] (empty — nothing to say). Reads the edit
 *  payload; the one payload-only exception is a Write's approval flip, which asks git
 *  for the committed version — the only "before" a post-edit hook still has.
 *
 *  A whole-file Write of a plan produces no Files-line note: creating/rewriting a plan
 *  is the normal flow (the fast lane does exactly that); that note is for an Edit that
 *  touches an existing scope line — the shape a quiet self-expansion of scope would
 *  take. The approval status is the exception: a Write that flips a plan to
 *  `status: approved` (against git HEAD) is noted like an Edit — the flip is the
 *  self-authorization the note exists for, and a Write is its quietest route. Git
 *  trouble or no projectDir → no note (the fail-safe is silence, not noise). */
export function scopeChangeNotes(toolInput, projectDir) {
  if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)) return [];
  const notes = [];
  const norm = (p) => String(p).replace(/^@/, "").replace(/\\/g, "/");

  const targets = editedFilePaths(toolInput, 5);
  const deltas = [];
  const push = (v) => {
    if (typeof v === "string" && v) deltas.push(v);
  };
  push(toolInput.old_string ?? toolInput.oldText);
  push(toolInput.new_string ?? toolInput.newText);
  push(toolInput.input ?? toolInput.patch ?? toolInput.patch_text ?? toolInput.patchText); // apply_patch text
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (!e || typeof e !== "object") continue;
      push(e.old_string ?? e.oldText);
      push(e.new_string ?? e.newText);
    }
  }
  // A patch line carries a +/- marker before the content ("- Files:" becomes "-- Files:");
  // one leading marker is stripped before the test, so context lines (a leading space) do
  // not count — only the lines the edit actually changes.
  const filesLine = (s) =>
    /^\s*[-*+]\s*files?\s*:/i.test(s) || /^\s*[-*+]\s*files?\s*:/i.test(s.replace(/^[+-]/, ""));
  const touchesFilesLine = deltas.some((d) => d.split(/\r?\n/).some(filesLine));
  const statusLine = (s) =>
    /^\s*status\s*:/i.test(s) || /^\s*[-+]\s*status\s*:/i.test(s.replace(/^[+-]/, ""));
  const touchesStatusLine = deltas.some((d) => d.split(/\r?\n/).some(statusLine));

  for (const target of targets) {
    const p = norm(target);
    const base = p.slice(p.lastIndexOf("/") + 1);
    if (base === ".secrets-allow" || base === ".vuln-allow") {
      const guard = base === ".secrets-allow" ? "secrets-guard" : "vuln-guard";
      notes.push(
        `${guard}: "${base}" was just edited — what the git boundary lets through changes with it. ` +
          "If this was not the user's decision, revert the edit; the change is visible in the git diff.",
      );
      continue;
    }
    if (/(?:^|\/)docs\/plans\/[^/]+\.md$/i.test(p)) {
      if (touchesFilesLine && toolInput.content === undefined) {
        notes.push(
          'spec-gate: a "- Files:" scope line of a plan in docs/plans/ was just edited — the gate\'s ' +
            "editable scope changes with it. If this was not the user's decision, revert the edit; " +
            "the scope change is visible in the plan's git diff.",
        );
      }
      if (touchesStatusLine && toolInput.content === undefined) {
        notes.push(STATUS_FLIP_NOTE);
      }
      if (toolInput.content !== undefined && writesApprovalFlip(p, toolInput.content, projectDir)) {
        notes.push(STATUS_FLIP_NOTE);
      }
    }
  }
  return [...new Set(notes)];
}

/** Collect docs/plans/*.md and extract the file paths of all open (unticked) tasks.
 *  Also reports which plan files still have open work and the open tasks' titles —
 *  plan-context uses these to orient a fresh session; spec-gate ignores them.
 *
 *  A plan authorizes code edits only once the user has approved it — its frontmatter
 *  carries `status: approved`. Anything else (draft, missing) leaves the plan a
 *  proposal: its tasks open nothing, and its name lands in `unapprovedPlans` (decide()
 *  blocks code edits with a "not approved" reason; plan-context surfaces the state).
 *  The constrained agent cannot grant itself authorization: the flip to `approved` is
 *  a boundary edit — scopeChangeNotes calls it out, and it lands in the git diff. */
export function activePlanInfo(projectDir) {
  const result = {
    hasOpenTasks: false,
    openFiles: [],
    openPlans: [],
    openTaskTitles: [],
    openTaskCount: 0,
    // Plans with open tasks whose frontmatter does not carry `status: approved` —
    // proposals, not authorizations (see decide()).
    unapprovedPlans: [],
    // An open task has a "- Files:" line but no backticked paths could be parsed —
    // the plan is malformed, so its scope is unknown (see decide()).
    unparsedFiles: false,
    // A plan file ends inside a code fence — an unbalanced fence swallows every task
    // after it, so the gate silently loses scope. Parsed per file; decide() stays
    // fail-open, plan-context warns.
    unbalancedFence: false,
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
  const unapprovedPlans = new Set();
  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(plansDir, f), "utf8");
    } catch {
      continue;
    }
    const approved = planIsApproved(text);
    let inTask = false;
    let taskOpen = false;
    let taskHasFilesLine = false;
    let taskFiles = [];
    let taskTitle = "";
    let inFence = false; // a fenced example inside a plan is prose, never contract
    let filesTail = false; // the task's last bullet was a "- Files:" line — its wrap continues the list
    const collectFilesPaths = (s) => {
      for (const m of s.matchAll(/`([^`]+)`/g)) {
        taskFiles.push(m[1].trim().replace(/\\/g, "/").replace(/^\.\//, ""));
      }
    };
    const flush = () => {
      if (inTask && taskOpen) {
        if (approved) {
          result.hasOpenTasks = true;
          result.openTaskCount++;
          openPlans.add(f);
          result.openTaskTitles.push(taskTitle || "(untitled task)");
          for (const p of taskFiles) openFiles.add(p);
          if (taskHasFilesLine && taskFiles.length === 0) result.unparsedFiles = true;
        } else {
          unapprovedPlans.add(f);
        }
      }
      inTask = false;
      taskOpen = false;
      taskHasFilesLine = false;
      taskFiles = [];
      taskTitle = "";
      filesTail = false;
    };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        filesTail = false;
        continue;
      }
      if (inFence) continue;
      if (/^#{2,4}\s+task\b/i.test(line)) {
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
      if (!/^[-*+]\s/.test(line.trim())) {
        // A "- Files:" list wraps like any long markdown line (lazy continuation):
        // the backticked paths on the wrap belong to the same scope line. The tail
        // ends at a blank line, a new bullet, a heading, or a fence — later prose
        // must not leak into the scope.
        if (line.trim() === "") filesTail = false;
        else if (filesTail) collectFilesPaths(line);
        continue;
      }
      filesTail = false;
      const bullet = line.trim().toLowerCase().replace(/^[-*+]+\s*/, "");
      // Closure is the explicit marker ("- Done: <commit>"); "- [x]" checkboxes are
      // progress notes and never close a task.
      if (/^done\s*[:—]/.test(bullet.replace(/^\[x\]\s*/i, ""))) {
        taskOpen = false; // files of a closed task are no longer editable
        continue;
      }
      if (/^files\s*:/i.test(bullet)) {
        taskHasFilesLine = true;
        filesTail = true;
        collectFilesPaths(line);
      }
    }
    flush();
    if (inFence) result.unbalancedFence = true; // EOF inside a fence — the tail was prose
  }
  result.openFiles = [...openFiles];
  result.openPlans = [...openPlans];
  result.unapprovedPlans = [...unapprovedPlans];
  return result;
}

// Windows is always case-insensitive; macOS default filesystems (HFS+/APFS) are too —
// a plan spelling `Foo.ts` must not false-block an edit of `foo.ts` there. Linux stays
// case-sensitive: there those are two different files.
const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

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
            'are required, and the line must come before any "- Done:" marker. A wrapped list is ' +
            'fine — keep every path in backticks and no blank line inside the list.',
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
  // A plan with open tasks that the user has not approved is a proposal, not an
  // authorization: its tasks open nothing, so it gates every code edit until the
  // frontmatter carries `status: approved` — the flip is a boundary edit the
  // git diff shows (scopeChangeNotes notes it). Checked before the hard-mode
  // fallback: the "not approved" reason is more specific than "no active plan".
  if (info.unapprovedPlans.length > 0) {
    return {
      action: "block",
      reason:
        `spec-gate: the plan ${info.unapprovedPlans.join(", ")} in docs/plans/ is not approved ` +
        "yet — its frontmatter does not carry `status: approved`, and a plan authorizes code " +
        "edits only after the user approves it. Docs (docs/specs, docs/plans, *.md) stay " +
        "editable: finish the plan, get the user's approval, then set the status — the flip " +
        "is visible in the git diff.",
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
