#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const TOP_FILE_LIMIT = 30;
const TOP_EFFECT_LIMIT = 20;

const sourceExtensions = new Set([".ts", ".tsx"]);
const reactExtensions = new Set([".tsx"]);
const ignoredDirs = new Set([
  ".git",
  "dist",
  "node_modules",
  "release",
  "coverage",
]);

const staleDocPatterns = [
  /src\/main\/agent-runner\b/g,
  /src\/main\/manifest\b/g,
  /src\/main\/chat-store\b/g,
  /src\/main\/workspace-search\b/g,
  /src\/main\/git\.ts\b/g,
  /src\/main\/voice-realtime\b/g,
  /src\/main\/terminal-session\b/g,
  /src\/main\/app-project-store\b/g,
];

const docRoots = [
  "README.md",
  "AGENTS.md",
  "src",
  "docs",
];

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function collectFiles(startDir, predicate = () => true) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && predicate(fullPath)) files.push(fullPath);
    }
  }

  if (existsSync(startDir)) await walk(startDir);
  return files;
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

function countMatches(text, regex) {
  return text.match(regex)?.length ?? 0;
}

function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log("  none");
    return;
  }

  const widths = columns.map((column) =>
    Math.max(
      column.label.length,
      ...rows.map((row) => String(row[column.key]).length),
    ),
  );
  const header = columns
    .map((column, index) => column.label.padEnd(widths[index]))
    .join("  ");
  console.log(`  ${header}`);
  console.log(`  ${widths.map((width) => "-".repeat(width)).join("  ")}`);
  for (const row of rows) {
    console.log(
      `  ${columns
        .map((column, index) => String(row[column.key]).padEnd(widths[index]))
        .join("  ")}`,
    );
  }
}

async function largestSourceFiles() {
  const files = await collectFiles(srcDir, (filePath) =>
    sourceExtensions.has(path.extname(filePath)),
  );
  const rows = [];
  for (const filePath of files) {
    const text = await readText(filePath);
    rows.push({
      lines: text.split(/\r?\n/).length,
      file: relative(filePath),
    });
  }
  return rows.sort((a, b) => b.lines - a.lines).slice(0, TOP_FILE_LIMIT);
}

async function effectHeavyFiles() {
  const files = await collectFiles(srcDir, (filePath) =>
    reactExtensions.has(path.extname(filePath)),
  );
  const rows = [];
  for (const filePath of files) {
    const text = await readText(filePath);
    const useEffect = countMatches(text, /\buseEffect\s*\(/g);
    const useLayoutEffect = countMatches(text, /\buseLayoutEffect\s*\(/g);
    const total = useEffect + useLayoutEffect;
    if (total > 0) {
      rows.push({
        effects: total,
        useEffect,
        useLayoutEffect,
        file: relative(filePath),
      });
    }
  }
  return rows.sort((a, b) => b.effects - a.effects).slice(0, TOP_EFFECT_LIMIT);
}

async function rendererHarnessSupportImports() {
  const rendererDir = path.join(root, "src/renderer/src");
  const files = await collectFiles(rendererDir, (filePath) =>
    sourceExtensions.has(path.extname(filePath)),
  );
  const rows = [];
  for (const filePath of files) {
    const rel = relative(filePath);
    if (rel.startsWith("src/renderer/src/lib/legacy-agent/")) continue;
    const lines = (await readText(filePath)).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes("harness-support")) {
        rows.push({
          line: index + 1,
          file: rel,
          text: line.trim(),
        });
      }
    });
  }
  return rows;
}

async function staleDocReferences() {
  const docFiles = [];
  for (const docRoot of docRoots) {
    const fullPath = path.join(root, docRoot);
    if (!existsSync(fullPath)) continue;
    if (docRoot.endsWith(".md")) {
      docFiles.push(fullPath);
      continue;
    }
    docFiles.push(
      ...(await collectFiles(fullPath, (filePath) =>
        [".md", ".mdx"].includes(path.extname(filePath)),
      )),
    );
  }

  const rows = [];
  for (const filePath of docFiles) {
    const lines = (await readText(filePath)).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of staleDocPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          rows.push({
            line: index + 1,
            file: relative(filePath),
            text: line.trim(),
          });
          break;
        }
      }
    });
  }
  return rows;
}

console.log("GrokForge cleanup audit\n");

console.log(`Top ${TOP_FILE_LIMIT} largest source files`);
printTable(await largestSourceFiles(), [
  { key: "lines", label: "lines" },
  { key: "file", label: "file" },
]);

console.log(`\nTop ${TOP_EFFECT_LIMIT} React files by effects`);
printTable(await effectHeavyFiles(), [
  { key: "effects", label: "effects" },
  { key: "useEffect", label: "useEffect" },
  { key: "useLayoutEffect", label: "layout" },
  { key: "file", label: "file" },
]);

console.log("\nActive renderer imports from harness-support");
printTable(await rendererHarnessSupportImports(), [
  { key: "file", label: "file" },
  { key: "line", label: "line" },
  { key: "text", label: "import" },
]);

console.log("\nStale active-doc references to removed flat paths");
printTable(await staleDocReferences(), [
  { key: "file", label: "file" },
  { key: "line", label: "line" },
  { key: "text", label: "text" },
]);
