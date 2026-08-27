import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), ".github", "workflows");
for (const name of await readdir(directory)) {
  if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
  const body = await readFile(join(directory, name), "utf8");
  for (const line of body.split("\n")) {
    const reference = line.match(/^\s*(?:-\s*)?uses:\s+\S+@([^\s#]+)/)?.[1];
    if (reference && !/^[0-9a-f]{40}$/.test(reference)) {
      throw new Error(`${name} contains a mutable GitHub Action reference: @${reference}`);
    }
  }
}

console.log("Workflow supply-chain gate passed: every external action is pinned to a full commit.");
