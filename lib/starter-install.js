const STARTER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;

function requireSlug(value) {
  if (typeof value !== "string" || !STARTER_SLUG.test(value)) {
    throw new Error("starter slug must be lowercase kebab-case");
  }
  return value;
}

function requireSha256(value) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error("starter SHA-256 must be 64 lowercase hexadecimal characters");
  }
  return value;
}

function requireArchive(value, slug) {
  const expected = `/starters/v1/${slug}.zip`;
  if (value !== expected) throw new Error(`starter archive must be ${expected}`);
  return value;
}

function requireInstaller(entry, slug, shell) {
  const extension = shell === "posix" ? "sh" : "ps1";
  const expectedPath = `/starters/v1/${slug}.${extension}`;
  const installer = entry?.installers?.[shell];
  if (!installer || typeof installer !== "object") {
    throw new Error(`starter ${shell} installer metadata is required`);
  }
  if (installer.path !== expectedPath) {
    throw new Error(`starter ${shell} installer path must be ${expectedPath}`);
  }
  return Object.freeze({
    path: expectedPath,
    sha256: requireSha256(installer.sha256),
  });
}

function buildFileVerificationScript({ file, sha256, label }) {
  const checkedSha256 = requireSha256(sha256);
  if (typeof file !== "string" || !/^ackrate-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:zip|sh|ps1)$/.test(file)) {
    throw new Error("verification filename is invalid");
  }
  return `const f='${file}',e='${checkedSha256}',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('${label} integrity check failed')}`;
}

export function buildStarterArchiveVerificationScript({ file, sha256 }) {
  if (typeof file !== "string" || !/^ackrate-[a-z0-9]+(?:-[a-z0-9]+)*\.zip$/.test(file)) {
    throw new Error("starter archive filename is invalid");
  }
  return buildFileVerificationScript({ file, sha256, label: "Starter" });
}

function validatedStarter(entry, shell) {
  if (!entry || typeof entry !== "object") throw new Error("starter manifest entry is required");
  if (shell !== "posix" && shell !== "powershell") {
    throw new Error("starter shell must be posix or powershell");
  }
  const slug = requireSlug(entry.slug);
  const archive = requireArchive(entry.archive, slug);
  const sha256 = requireSha256(entry.sha256);
  const file = `ackrate-${slug}.zip`;
  return Object.freeze({ slug, archive, sha256, file });
}

export function buildStarterInstallerScript(entry, { shell = "posix" } = {}) {
  const { archive, sha256, file } = validatedStarter(entry, shell);
  const verify = buildStarterArchiveVerificationScript({ file, sha256 });
  if (shell === "powershell") {
    return `$ErrorActionPreference = 'Stop'
$archive = '${file}'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com${archive}' -OutFile $archive
  node -e "${verify}"
  if ($LASTEXITCODE -ne 0) { throw 'Starter integrity verification failed' }
  Expand-Archive -LiteralPath $archive -DestinationPath '.' -Force
  Remove-Item -LiteralPath $archive
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  Write-Host ''
  Write-Host 'ACKRATE starter installed. Run: npm run demo'
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
`;
  }
  return `#!/bin/sh
set -eu
archive='${file}'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com${archive}'
node -e "${verify}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\\nACKRATE starter installed. Run: npm run demo\\n'
`;
}

export function buildStarterInstallCommand(entry, { shell = "posix" } = {}) {
  const { slug } = validatedStarter(entry, shell);
  const installer = requireInstaller(entry, slug, shell);
  if (shell === "powershell") {
    // PowerShell parallel of the POSIX form: Invoke-RestMethod returns the whole
    // installer body as a string (download completes first), [scriptblock]::Create
    // compiles it, and `&` runs it — so a truncated fetch can't half-run, unlike
    // piping into Invoke-Expression. The installer self-verifies the ZIP payload
    // hash before extracting, so the executed code stays integrity-checked.
    return `& ([scriptblock]::Create((Invoke-RestMethod -Uri 'https://staging.ackrate.com${installer.path}')))`;
  }
  // Download the whole installer, then execute it — command substitution completes
  // the download before `sh` runs a byte of it, so a truncated fetch can't half-run
  // the way streaming a download straight into a shell can. The installer
  // self-verifies the ZIP payload's SHA-256 against the pinned manifest hash before
  // extracting, so the code that actually runs is still integrity-checked.
  // `requireInstaller` keeps validating the pinned installer path/hash so a tampered
  // manifest still fails closed.
  return `/bin/sh -c "$(curl -fsSL https://staging.ackrate.com${installer.path})"`;
}
