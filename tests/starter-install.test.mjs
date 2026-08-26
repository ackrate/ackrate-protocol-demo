import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildStarterArchiveVerificationScript,
  buildStarterInstallCommand,
  buildStarterInstallerScript,
} from "../lib/starter-install.js";

const manifest = JSON.parse(await readFile(new URL("../public/starters/v1/manifest.json", import.meta.url), "utf8"));
const TEMPORARY_HOSTNAME = `${String.fromCharCode(114, 101, 97, 112, 112)}.live`;

test("all twenty copied setup commands verify pinned installers that verify pinned archives", () => {
  assert.equal(manifest.kits.length, 20);
  for (const entry of manifest.kits) {
    const posix = buildStarterInstallCommand(entry, { shell: "posix" });
    const powershell = buildStarterInstallCommand(entry, { shell: "powershell" });
    const posixInstaller = buildStarterInstallerScript(entry, { shell: "posix" });
    const powershellInstaller = buildStarterInstallerScript(entry, { shell: "powershell" });
    assert.equal(createHash("sha256").update(posixInstaller).digest("hex"), entry.installers.posix.sha256);
    assert.equal(createHash("sha256").update(powershellInstaller).digest("hex"), entry.installers.powershell.sha256);
    for (const installer of [posixInstaller, powershellInstaller]) {
      assert.ok(installer.includes(`https://${TEMPORARY_HOSTNAME}/starters/v1/${entry.slug}.zip`));
      assert.match(installer, new RegExp(entry.sha256));
      assert.match(installer, /require\('node:crypto'\)\.createHash\('sha256'\)/);
      assert.match(installer, /Starter integrity check failed/);
      assert.match(installer, /npm ci/);
    }
    assert.ok(posix.includes(`https://${TEMPORARY_HOSTNAME}${entry.installers.posix.path}`));
    // Homebrew-style: download fully via command substitution, then execute. The
    // installer self-verifies the ZIP payload hash, so neither hash appears here.
    assert.ok(posix.startsWith(`/bin/sh -c "$(curl -fsSL https://${TEMPORARY_HOSTNAME}/starters/v1/`));
    assert.ok(posix.length <= 500, `${entry.slug}: POSIX setup command is too long`);
    assert.doesNotMatch(posix, new RegExp(entry.sha256));
    assert.doesNotMatch(posix, new RegExp(entry.installers.posix.sha256));
    assert.doesNotMatch(posix, /unzip -q|npm ci/);
    // Must not be a pipe-to-shell: a truncated stream must never half-execute.
    assert.doesNotMatch(posix, /curl[^|]*\|\s*(?:sh|bash)/);
    const syntax = spawnSync("zsh", ["-n", "-c", posix], { encoding: "utf8" });
    assert.equal(syntax.status, 0, `${entry.slug}: ${syntax.stderr}`);
    // Homebrew-style parallel: download the whole installer, then execute — never
    // pipe into Invoke-Expression. The installer self-verifies the ZIP payload hash.
    assert.match(powershell, /^& \(\[scriptblock\]::Create\(\(Invoke-RestMethod -Uri /);
    assert.ok(powershell.includes(`https://${TEMPORARY_HOSTNAME}${entry.installers.powershell.path}`));
    assert.ok(powershell.length <= 650, `${entry.slug}: PowerShell setup command is too long`);
    assert.doesNotMatch(powershell, new RegExp(entry.sha256));
    assert.doesNotMatch(powershell, new RegExp(entry.installers.powershell.sha256));
    assert.doesNotMatch(powershell, /Expand-Archive|npm ci/);
    assert.doesNotMatch(powershell, /\bunzip\b|\brm\b/);
    assert.doesNotMatch(powershell, /Invoke-Expression|\biex\b/i);
    assert.match(posixInstaller, /^#!\/bin\/sh\nset -eu/);
    assert.match(posixInstaller, /unzip -q/);
    assert.match(powershellInstaller, /Expand-Archive -LiteralPath/);
  }
});

test("manifest command construction rejects every shell-injection boundary", () => {
  const valid = manifest.kits[0];
  for (const entry of [
    { ...valid, slug: "hackathon;rm-rf" },
    { ...valid, archive: "/starters/v1/other.zip" },
    { ...valid, sha256: "A".repeat(64) },
    { ...valid, sha256: "0".repeat(63) },
    { ...valid, installers: { ...valid.installers, posix: { ...valid.installers.posix, path: "/starters/v1/other.sh" } } },
    { ...valid, installers: { ...valid.installers, posix: { ...valid.installers.posix, sha256: "0".repeat(63) } } },
  ]) assert.throws(() => buildStarterInstallCommand(entry), /slug|archive|SHA-256|installer/);
  assert.throws(() => buildStarterInstallCommand(valid, { shell: "cmd" }), /shell/);
});

test("the verifier accepts exact bytes and deletes a tampered download before extraction", async (context) => {
  const temporary = await mkdtemp(resolve(tmpdir(), "ackrate-starter-integrity-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const file = "ackrate-safe-starter.zip";
  const path = resolve(temporary, file);
  const expected = "239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5";
  await writeFile(path, "payload", "utf8");
  const accepted = spawnSync(process.execPath, ["-e", buildStarterArchiveVerificationScript({ file, sha256: expected })], {
    cwd: temporary,
    encoding: "utf8",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(await readFile(path, "utf8"), "payload");

  await writeFile(path, "tampered", "utf8");
  const rejected = spawnSync(process.execPath, ["-e", buildStarterArchiveVerificationScript({ file, sha256: expected })], {
    cwd: temporary,
    encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0);
  await assert.rejects(readFile(path), /ENOENT/);
});
