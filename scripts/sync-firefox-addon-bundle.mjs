#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, '.output', 'firefox-mv2');
const targetDir = path.join(repoRoot, 'firefox-addon');
const mode = process.argv.includes('--sync') ? 'sync' : 'check';

function runFirefoxBuild() {
  const result = spawnSync('bun', ['run', 'build:firefox'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

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

function copyDir(sourcePath, destinationPath) {
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

function deleteRecursively(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

let quarantinedTargetDir = null;
let exitCode = 0;

if (fs.existsSync(targetDir)) {
  const quarantineParentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudofill-firefox-addon-'));
  quarantinedTargetDir = path.join(quarantineParentDir, 'firefox-addon');
  copyDir(targetDir, quarantinedTargetDir);
  deleteRecursively(targetDir);
}

try {
  runFirefoxBuild();

  if (!fs.existsSync(sourceDir)) {
    console.error(`Missing source bundle: ${path.relative(repoRoot, sourceDir)}`);
    exitCode = 1;
  } else {
    const sourceFiles = walk(sourceDir, sourceDir);
    const targetSnapshotDir = mode === 'check' ? quarantinedTargetDir : targetDir;
    const targetFiles = walk(targetSnapshotDir, targetSnapshotDir);
    const sourceSet = new Set(sourceFiles);
    const targetSet = new Set(targetFiles);

    const missing = sourceFiles.filter((file) => !targetSet.has(file));
    const extra = targetFiles.filter((file) => !sourceSet.has(file));
    const different = [];

    for (const file of sourceFiles) {
      if (!targetSet.has(file)) continue;
      const sourceBytes = fs.readFileSync(path.join(sourceDir, file));
      const targetBytes = fs.readFileSync(path.join(targetSnapshotDir, file));
      if (!sourceBytes.equals(targetBytes)) different.push(file);
    }

    const hasDiff = missing.length > 0 || extra.length > 0 || different.length > 0;

    if (mode === 'check') {
      if (!hasDiff) {
        console.log('firefox-addon bundle is up to date.');
      } else {
        console.error('firefox-addon bundle is out of date.');
        if (missing.length) console.error(`Missing in firefox-addon: ${missing.join(', ')}`);
        if (extra.length) console.error(`Extra in firefox-addon: ${extra.join(', ')}`);
        if (different.length) console.error(`Different content: ${different.join(', ')}`);
        exitCode = 1;
      }
    } else {
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
    }
  }
} finally {
  if (mode === 'check' && quarantinedTargetDir) {
    if (fs.existsSync(targetDir)) {
      deleteRecursively(targetDir);
    }
    copyDir(quarantinedTargetDir, targetDir);
  }

  if (quarantinedTargetDir && fs.existsSync(quarantinedTargetDir)) {
    deleteRecursively(quarantinedTargetDir);
  }
}

process.exit(exitCode);
