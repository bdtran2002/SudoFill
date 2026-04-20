#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, '.output', 'firefox-mv2');
const targetDir = path.join(repoRoot, 'firefox-addon');
const mode = process.argv.includes('--sync') ? 'sync' : 'check';

function walk(dir, baseDir) {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      entries.push(...walk(fullPath, baseDir));
    } else if (entry.isFile()) {
      entries.push(relativePath);
    }
  }
  return entries.sort();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function deleteRecursively(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) deleteRecursively(fullPath);
    else fs.unlinkSync(fullPath);
  }
  fs.rmdirSync(dirPath);
}

if (!fs.existsSync(sourceDir)) {
  console.error(`Missing source bundle: ${path.relative(repoRoot, sourceDir)}`);
  process.exit(1);
}

const sourceFiles = walk(sourceDir, sourceDir);
const targetFiles = walk(targetDir, targetDir);
const sourceSet = new Set(sourceFiles);
const targetSet = new Set(targetFiles);

const missing = sourceFiles.filter((file) => !targetSet.has(file));
const extra = targetFiles.filter((file) => !sourceSet.has(file));
const different = [];

for (const file of sourceFiles) {
  if (!targetSet.has(file)) continue;
  const sourceBytes = fs.readFileSync(path.join(sourceDir, file));
  const targetBytes = fs.readFileSync(path.join(targetDir, file));
  if (!sourceBytes.equals(targetBytes)) different.push(file);
}

const hasDiff = missing.length > 0 || extra.length > 0 || different.length > 0;

if (mode === 'check') {
  if (!hasDiff) {
    console.log('firefox-addon bundle is up to date.');
    process.exit(0);
  }

  console.error('firefox-addon bundle is out of date.');
  if (missing.length) console.error(`Missing in firefox-addon: ${missing.join(', ')}`);
  if (extra.length) console.error(`Extra in firefox-addon: ${extra.join(', ')}`);
  if (different.length) console.error(`Different content: ${different.join(', ')}`);
  process.exit(1);
}

if (fs.existsSync(targetDir)) {
  deleteRecursively(targetDir);
}
ensureDir(targetDir);
for (const file of sourceFiles) {
  const src = path.join(sourceDir, file);
  const dest = path.join(targetDir, file);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

console.log(
  `Synced ${sourceFiles.length} files from ${path.relative(repoRoot, sourceDir)} to ${path.relative(repoRoot, targetDir)}.`,
);
