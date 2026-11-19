/**
 * config-guard-core.mjs — the quality-tool config classifier for the config-guard hook.
 *
 * The policy it encodes: the agent does not weaken the project's quality tools. Editing
 * an EXISTING linter/formatter config — or its ignore file, where exclusions live —
 * changes what every future check sees: a relaxed rule, a silenced path is the cheapest
 * way to make a finding disappear. That decision is the user's. CREATING a config is
 * deliberately allowed: a project without a linter config is bootstrap, not weakening —
 * there is nothing to weaken yet, and the first config is how the discipline starts.
 * Deletion counts as an edit (the file exists on disk) — removing the config is the
 * strongest weakening there is.
 *
 * Matched by basename only, case folded: the filesystems that matter here (Windows,
 * macOS) treat `.ESLINTRC` and `.eslintrc` as the same file, and a subdirectory config
 * (`packages/lib/.eslintrc.json`) is as load-bearing as a root one. Both the flat
 * style and the rc style are listed — a migration shadow left behind is still what
 * the tool reads.
 *
 * Fail-safe direction: the core only ever says "block" for a name on the list of a file
 * that exists; anything else — an unknown name, a creation, a parse doubt — reads as
 * null (not recognized). The disk check belongs to the adapter (the core is pure per
 * the house rule); existsSync never throws, and a stat error reads as "not there" — a
 * creation, never a block.
 */

/** Protected basenames — data, not logic. eslint, prettier, biome, ruff, stylelint,
 *  markdownlint: the config family of each plus its ignore file. */
const PROTECTED_BASENAMES = [
  // eslint — the flat config and the rc family, plus the ignore file
  "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml",
  ".eslintignore",
  // prettier
  ".prettierrc", ".prettierrc.json", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.yaml", ".prettierrc.yml",
  "prettier.config.js", "prettier.config.mjs", "prettier.config.cjs",
  ".prettierignore",
  // biome
  "biome.json", "biome.jsonc",
  // ruff
  "ruff.toml", ".ruff.toml", ".ruffignore",
  // stylelint
  "stylelint.config.js", "stylelint.config.cjs", "stylelint.config.mjs",
  ".stylelintrc", ".stylelintrc.json", ".stylelintrc.js", ".stylelintrc.cjs", ".stylelintrc.yaml", ".stylelintrc.yml",
  ".stylelintignore",
  // markdownlint
  ".markdownlint.json", ".markdownlint.rc", ".markdownlint.rc.json", ".markdownlint.rc.yaml", ".markdownlint.rc.yml",
  ".markdownlint-ignore", ".markdownlintignore",
];

const PROTECTED = new Set(PROTECTED_BASENAMES.map((n) => n.toLowerCase()));

/** The protected basenames, as data for the tests (a copy — the set stays private). */
export function protectedConfigBasenames() {
  return [...PROTECTED_BASENAMES];
}

/** Classify an edit target: (filePath, existsOnDisk) → the block reason | null.
 *  A protected basename of a file that exists → block; a creation, an unknown name,
 *  an empty path → null. Pure — the adapter owns the disk check. */
export function configGuardReason(filePath, existsOnDisk) {
  const path = String(filePath ?? "");
  // Backslashes are folded first — a Windows path must not hide the basename.
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  if (!base || !PROTECTED.has(base.toLowerCase()) || !existsOnDisk) return null;
  return (
    `config-guard: "${path}" is an existing linter/formatter config (or its ignore ` +
    "file) — the agent does not weaken the project's quality checks. Fix the code the " +
    "tool points at; a config change is the user's decision — have them edit the config " +
    "themselves. Creating a config where none exists yet is allowed (bootstrap)."
  );
}
