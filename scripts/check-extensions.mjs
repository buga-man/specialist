#!/usr/bin/env node
/**
 * check-extensions.mjs — the TypeScript surfaces of the plugin (extensions/*.ts,
 * plugins/opencode/index.ts) are loaded by their hosts (pi, OpenCode) and by
 * nothing in this repository: npm test never parses them, so a broken import or
 * a renamed core export used to ship green. This closes the gap with zero
 * dependencies:
 *
 *   1. Import contract — every repo-relative import resolves to a file, and
 *      every value symbol it names is actually exported there (checked by
 *      importing the target module — the .mjs cores are import-safe); bare
 *      specifiers must be node: builtins or one of the host SDKs.
 *   2. Coarse syntax — the file's brackets balance outside strings, templates
 *      and comments, and nothing is left unterminated at EOF. Not a parser and
 *      deliberately not a type check (the host SDKs own the types): it catches
 *      the truncation/garbage class a diff review misses.
 *
 * Exit codes: 0 — clean, 1 — findings.
 * Run: node scripts/check-extensions.mjs (also part of npm test)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The host SDKs the TypeScript files import at runtime — loaded by their hosts,
 *  absent here on purpose. Anything else bare is a finding: an unknown package
 *  is a dependency decision, not an accident to wave through. */
const HOST_PACKAGES = ["@earendil-works/pi-coding-agent", "@opencode/plugin"];

/**
 * The static imports of a TypeScript/JavaScript source: { names, specifier },
 * names as { name, typeOnly } (the imported name — the left side of an `as`
 * alias — is the symbol the target module must export).
 * @param {string} source
 */
export function extractImports(source) {
  const found = [];
  // The clause of a from-import never holds a semicolon or a quote — those bound
  // the statement, and without excluding them a side-effect import (no `from`)
  // would bleed its clause into the next import.
  const fromRe = /import\s+(type\s+)?([^;'"`]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of String(source ?? "").matchAll(fromRe)) {
    found.push({ index: m.index, typeOnly: Boolean(m[1]), clause: m[2].trim(), specifier: m[3] });
  }
  const sideRe = /import\s*["']([^"']+)["']/g; // side-effect — nothing named to check
  for (const m of String(source ?? "").matchAll(sideRe)) {
    found.push({ index: m.index, typeOnly: false, clause: "", specifier: m[1] });
  }
  found.sort((a, b) => a.index - b.index);

  const out = [];
  for (const { typeOnly: wholeTypeOnly, clause, specifier } of found) {
    const names = [];
    // Split the clause on top-level commas: "D, { a as b, type T }" or "* as ns".
    const parts = [];
    let depth = 0;
    let current = "";
    for (const ch of clause) {
      if (ch === "{" || ch === "(") depth++;
      if (ch === "}" || ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
      } else current += ch;
    }
    if (current.trim()) parts.push(current);
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      const braced = /^\{(.*)\}$/s.exec(p);
      const entries = braced ? braced[1].split(",") : [p];
      for (const entry of entries) {
        const e = entry.trim();
        if (!e) continue;
        if (e.startsWith("*")) continue; // namespace — nothing to check in the target
        const inlineType = /^type\s+/.test(e);
        const name = e.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        names.push({ name, typeOnly: wholeTypeOnly || inlineType });
      }
    }
    out.push({ names, specifier });
  }
  return out;
}

/**
 * Coarse bracket balance of a source: null when the file holds together,
 * a finding string when a bracket opens without closing, a closer arrives
 * unmatched, or a string/template/comment runs to EOF unclosed. Regex literals
 * would masquerade as brackets — none exist in these files, and the check says
 * so in its message rather than pretending to be a parser.
 * @param {string} source
 * @param {string} label — the file name for the finding text.
 */
export function checkBalance(source, label) {
  const text = String(source ?? "");
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  let mode = "code"; // code | sq | dq | tpl | line | block
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (mode === "line") {
      if (ch === "\n") mode = "code";
      continue;
    }
    if (mode === "block") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i++;
      }
      continue;
    }
    if (mode === "sq" || mode === "dq") {
      if (ch === "\\") i++;
      else if ((mode === "sq" && ch === "'") || (mode === "dq" && ch === '"')) mode = "code";
      continue;
    }
    if (mode === "tpl") {
      if (ch === "\\") i++;
      else if (ch === "`") mode = "code";
      else if (ch === "$" && next === "{") {
        stack.push("${"); // a sentinel: its "}" returns to the template, never a pair
        mode = "code"; // the interpolation body is ordinary code
        i++;
      }
      continue;
    }
    // mode === code
    if (ch === "/" && next === "/") {
      mode = "line";
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      mode = "block";
      i++;
      continue;
    }
    if (ch === "'") {
      mode = "sq";
      continue;
    }
    if (ch === '"') {
      mode = "dq";
      continue;
    }
    if (ch === "`") {
      mode = "tpl";
      continue;
    }
    if (ch in pairs) stack.push(ch);
    else if (ch === ")" || ch === "]" || ch === "}") {
      const open = stack.pop();
      if (open === undefined) return `${label}: "${ch}" closes nothing (position ${i})`;
      if (open === "${") {
        if (ch === "}") mode = "tpl"; // LIFO: this "}" belongs to the interpolation
        else return `${label}: "${ch}" closes the interpolation from earlier (position ${i})`;
      } else if (pairs[open] !== ch) {
        return `${label}: "${ch}" closes the "${open}" from earlier (position ${i})`;
      }
    }
  }
  if (mode !== "code") {
    const what = mode === "sq" || mode === "dq" ? "string" : mode === "tpl" ? "template" : "comment";
    return `${label}: the file ends inside an unterminated ${what}`;
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    if (top === "${") return `${label}: the file ends inside an unterminated template interpolation`;
    return `${label}: "${top}" opens and never closes`;
  }
  return null;
}

/**
 * The import findings of one TypeScript file against the repository.
 * @param {string} absPath — the absolute path of the .ts file.
 * @returns {Promise<string[]>}
 */
export async function importFindings(absPath) {
  const findings = [];
  const source = readFileSync(absPath, "utf8");
  const imports = extractImports(source);
  for (const { names, specifier } of imports) {
    if (specifier.startsWith("node:")) continue;
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      if (!HOST_PACKAGES.includes(specifier)) {
        findings.push(`${absPath}: bare import "${specifier}" is not a host SDK or a node: builtin`);
      }
      continue;
    }
    const target = resolve(dirname(absPath), specifier);
    if (!existsSync(target)) {
      findings.push(`${absPath}: import "${specifier}" resolves to nothing (${target})`);
      continue;
    }
    if (!names.some((n) => !n.typeOnly)) continue; // type-only — erased at runtime
    let module;
    try {
      module = await import(pathToFileURL(target).href);
    } catch (error) {
      findings.push(`${absPath}: "${specifier}" cannot be imported: ${error?.message ?? error}`);
      continue;
    }
    for (const { name, typeOnly } of names) {
      if (typeOnly) continue;
      if (!(name in module)) {
        findings.push(`${absPath}: "${specifier}" exports nothing named "${name}"`);
      }
    }
  }
  return findings;
}

/** The TypeScript surfaces to check: the pi/omp extensions, the omp-only command
 *  modules, and the OpenCode plugin. */
export function tsFiles(rootDir) {
  const ext = readdirSync(join(rootDir, "extensions"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(rootDir, "extensions", f));
  const commandsDir = join(rootDir, "omp", "commands");
  const ompCommands = existsSync(commandsDir)
    ? readdirSync(commandsDir)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(commandsDir, f))
    : [];
  const openCode = join(rootDir, "plugins", "opencode", "index.ts");
  return [...ext, ...ompCommands, ...(existsSync(openCode) ? [openCode] : [])];
}

async function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const findings = [];
  for (const file of tsFiles(root)) {
    const rel = file.slice(root.length).replace(/\\/g, "/");
    const source = readFileSync(file, "utf8");
    const balance = checkBalance(source, rel);
    if (balance) findings.push(balance);
    findings.push(...(await importFindings(file)));
  }
  if (findings.length) {
    process.stdout.write(findings.map((f) => `- ${f}`).join("\n") + `\n${findings.length} finding(s)\n`);
    process.exit(1);
  }
  process.stdout.write("check-extensions: syntax balance and the import contract hold\n");
}

// The script runs both as a CLI and as an import in tests — main() only when executed.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
