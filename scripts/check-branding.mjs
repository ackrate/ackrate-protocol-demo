import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".next", ".vercel", "node_modules"]);
const retiredName = String.fromCharCode(114, 101, 97, 112, 112);
const temporaryHostname = `${retiredName}.live`;
const standardizedIdentifiers = ["SoftwareApplication"];
const findings = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.isFile() && entry.name.startsWith(".env.") && entry.name !== ".env.example") continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    const content = (await readFile(absolute)).toString("latin1");
    let checkedContent = content.replaceAll(temporaryHostname, "");
    for (const identifier of standardizedIdentifiers) checkedContent = checkedContent.replaceAll(identifier, "");
    if (new RegExp(`@${retiredName}-sdk/`, "i").test(checkedContent)) {
      findings.push(relative(root, absolute));
    }
  }
}

await visit(root);
if (findings.length > 0) {
  console.error(`Retired package scope remains:`);
  for (const file of findings) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log(`Branding gate passed. REAPP product name and @ackrate packages are current.`);
}
