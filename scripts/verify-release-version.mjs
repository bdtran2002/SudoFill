import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const checkGenerated = args.has('--check-generated');

const root = process.cwd();
const packagePath = resolve(root, 'package.json');
const firefoxManifestPath = resolve(root, 'firefox-addon/manifest.json');
const outputManifests = [
  resolve(root, '.output/firefox-mv2/manifest.json'),
  resolve(root, '.output/chrome-mv3/manifest.json'),
];

function fail(message) {
  console.error(`release-version check failed: ${message}`);
  process.exit(1);
}

function isValidSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
} catch {
  fail('could not read package.json');
}

const version = pkg?.version;
if (typeof version !== 'string' || !version.trim()) {
  fail('package.json version is missing');
}

if (!isValidSemver(version)) {
  fail(`package.json version must be a valid semver like 0.1.0 (found ${version})`);
}

if (version === '0.0.0') {
  fail('package.json version must be bumped above 0.0.0 before release');
}

const ref = process.env.GITHUB_REF || '';
const refName = process.env.GITHUB_REF_NAME || '';
const tagRef = ref.startsWith('refs/tags/')
  ? ref
  : refName.startsWith('v')
    ? `refs/tags/${refName}`
    : '';
if (tagRef) {
  const tagName = tagRef.slice('refs/tags/'.length);
  const expectedTag = `v${version}`;
  if (tagName !== expectedTag) {
    fail(`tag ${tagName} does not match package.json version ${version}; expected ${expectedTag}`);
  }
}

if (!existsSync(firefoxManifestPath)) {
  fail('firefox-addon/manifest.json is missing');
}

let firefoxManifest;
try {
  firefoxManifest = JSON.parse(readFileSync(firefoxManifestPath, 'utf8'));
} catch {
  fail('could not parse firefox-addon/manifest.json');
}

if (firefoxManifest?.version !== version) {
  fail(
    `firefox-addon/manifest.json version ${firefoxManifest?.version ?? '(missing)'} does not match package.json version ${version}`,
  );
}

if (checkGenerated) {
  for (const manifestPath of outputManifests) {
    if (!existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      fail(`could not parse ${manifestPath}`);
    }
    if (manifest?.version !== version) {
      fail(
        `${manifestPath} version ${manifest?.version ?? '(missing)'} does not match package.json version ${version}`,
      );
    }
  }
}

console.log(
  `release-version check passed for ${version}${checkGenerated ? ' (including generated manifests when present)' : ''}`,
);
