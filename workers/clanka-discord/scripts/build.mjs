import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(scriptDir, "..");
const repoRoot = resolve(workerRoot, "..", "..");
const distRoot = resolve(workerRoot, "dist");

const rewriteFile = async (filePath, replacements) => {
  let content = await readFile(filePath, "utf8");
  for (const [from, to] of replacements) {
    content = content.replaceAll(from, to);
  }
  await writeFile(filePath, content, "utf8");
};

await rm(distRoot, { recursive: true, force: true });
await mkdir(resolve(distRoot, "commands"), { recursive: true });
await mkdir(resolve(distRoot, "shared"), { recursive: true });

await cp(resolve(workerRoot, "src", "index.ts"), resolve(distRoot, "index.ts"));
await cp(resolve(workerRoot, "commands", "registry.ts"), resolve(distRoot, "commands", "registry.ts"));
await cp(resolve(repoRoot, "shared", "shield.ts"), resolve(distRoot, "shared", "shield.ts"));
await cp(resolve(repoRoot, "shared", "spine.ts"), resolve(distRoot, "shared", "spine.ts"));

await rewriteFile(resolve(distRoot, "index.ts"), [["../commands/registry", "./commands/registry"]]);
await rewriteFile(resolve(distRoot, "commands", "registry.ts"), [
  ["../../../shared/spine", "../shared/spine"],
  ["../../../shared/shield", "../shared/shield"],
]);

console.log("Built worker runtime files to dist/");
