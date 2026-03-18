import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, "..");
const defaultDocsDir = path.join(defaultRootDir, "docs");

/**
 * @typedef {{ id: string, label: string, filePath: string, group: string }} GraphNode
 * @typedef {{ from: string, to: string }} GraphEdge
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[] }} DependencyGraph
 */

/**
 * Build a dependency graph for the shared modules and worker source files.
 *
 * @param {{ rootDir?: string }} [options]
 * @returns {Promise<DependencyGraph>}
 */
export async function buildDependencyGraph(options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const fileEntries = await collectSourceFiles(rootDir);
  const nodeByFile = new Map(
    fileEntries.map((entry) => [
      entry.absolutePath,
      {
        id: entry.moduleId,
        label: entry.label,
        filePath: entry.relativePath,
        group: entry.group,
      },
    ]),
  );

  const edgeSet = new Set();

  for (const entry of fileEntries) {
    const sourceText = await fs.readFile(entry.absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      entry.absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    for (const specifier of extractSpecifiers(sourceFile)) {
      const resolvedPath = resolveInternalImport(entry.absolutePath, specifier, nodeByFile);
      if (!resolvedPath) {
        continue;
      }

      const fromNode = nodeByFile.get(entry.absolutePath);
      const toNode = nodeByFile.get(resolvedPath);
      if (!fromNode || !toNode) {
        continue;
      }

      edgeSet.add(`${fromNode.id}=>${toNode.id}`);
    }
  }

  const nodes = Array.from(nodeByFile.values()).sort(compareNodes);
  const edges = Array.from(edgeSet)
    .map((edge) => {
      const [from, to] = edge.split("=>");
      return { from, to };
    })
    .sort(compareEdges);

  return { nodes, edges };
}

/**
 * @param {DependencyGraph} graph
 * @returns {string}
 */
export function renderDot(graph) {
  const lines = [
    "digraph dependency_graph {",
    '  graph [rankdir="LR", fontname="Helvetica", bgcolor="white"];',
    '  node [shape="box", style="rounded,filled", fillcolor="#f6f8fa", color="#d0d7de", fontname="Helvetica"];',
    '  edge [color="#57606a"];',
    "",
  ];

  const groupOrder = Array.from(new Set(graph.nodes.map((node) => node.group)));

  for (const group of groupOrder) {
    lines.push(`  subgraph ${quote(`cluster_${sanitizeForCluster(group)}`)} {`);
    lines.push(`    label = ${quote(group)};`);
    lines.push('    color = "#d0d7de";');
    lines.push('    style = "rounded";');

    for (const node of graph.nodes.filter((candidate) => candidate.group === group)) {
      lines.push(
        `    ${quote(node.id)} [label=${quote(node.label)}, tooltip=${quote(node.filePath)}];`,
      );
    }

    lines.push("  }");
    lines.push("");
  }

  for (const edge of graph.edges) {
    lines.push(`  ${quote(edge.from)} -> ${quote(edge.to)};`);
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * @param {{ rootDir?: string, docsDir?: string }} [options]
 * @returns {Promise<{ dotPath: string, svgPath: string | null, graph: DependencyGraph }>}
 */
export async function writeDependencyGraph(options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const docsDir = options.docsDir ?? defaultDocsDir;
  const graph = await buildDependencyGraph({ rootDir });
  const dotContents = renderDot(graph);

  await fs.mkdir(docsDir, { recursive: true });

  const dotPath = path.join(docsDir, "dep-graph.dot");
  await fs.writeFile(dotPath, dotContents, "utf8");

  const svgPath = await maybeRenderSvg(dotPath, docsDir);
  return { dotPath, svgPath, graph };
}

async function main() {
  const { dotPath } = await writeDependencyGraph();
  console.log(`Wrote ${path.relative(defaultRootDir, dotPath)}`);
}

/**
 * @param {string} rootDir
 * @returns {Promise<Array<{ absolutePath: string, relativePath: string, moduleId: string, label: string, group: string }>>}
 */
async function collectSourceFiles(rootDir) {
  const sharedDir = path.join(rootDir, "shared");
  const workersDir = path.join(rootDir, "workers");

  const sharedEntries = await fs.readdir(sharedDir, { withFileTypes: true });
  const sharedFiles = sharedEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(sharedDir, entry.name));

  const workerEntries = await fs.readdir(workersDir, { withFileTypes: true });
  const workerFiles = [];

  for (const entry of workerEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const workerSrcDir = path.join(workersDir, entry.name, "src");
    const exists = await pathExists(workerSrcDir);
    if (!exists) {
      continue;
    }

    workerFiles.push(...(await collectTsFiles(workerSrcDir)));
  }

  const allFiles = [...sharedFiles, ...workerFiles].sort();

  return allFiles.map((absolutePath) => {
    const relativePath = normalizePath(path.relative(rootDir, absolutePath));
    return {
      absolutePath,
      relativePath,
      moduleId: toModuleId(relativePath),
      label: toLabel(relativePath),
      group: toGroup(relativePath),
    };
  });
}

/**
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function collectTsFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(absolutePath);
    }
  }

  return files;
}

/**
 * @param {ts.SourceFile} sourceFile
 * @returns {string[]}
 */
function extractSpecifiers(sourceFile) {
  const specifiers = [];

  sourceFile.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });

  return specifiers;
}

/**
 * @param {string} fromPath
 * @param {string} specifier
 * @param {Map<string, GraphNode>} nodeByFile
 * @returns {string | null}
 */
function resolveInternalImport(fromPath, specifier, nodeByFile) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromPath), specifier);
  for (const candidate of makeResolutionCandidates(basePath)) {
    if (nodeByFile.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * @param {string} basePath
 * @returns {string[]}
 */
function makeResolutionCandidates(basePath) {
  const extension = path.extname(basePath);
  if (extension === ".ts") {
    return [basePath];
  }

  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    const stem = basePath.slice(0, -extension.length);
    return [`${stem}.ts`, basePath];
  }

  return [`${basePath}.ts`, path.join(basePath, "index.ts")];
}

/**
 * @param {string} dotPath
 * @param {string} docsDir
 * @returns {Promise<string | null>}
 */
async function maybeRenderSvg(dotPath, docsDir) {
  const svgPath = path.join(docsDir, "dep-graph.svg");
  const result = spawnSync("dot", ["-Tsvg", dotPath, "-o", svgPath], {
    stdio: "ignore",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      return null;
    }

    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error("Graphviz failed to render docs/dep-graph.svg");
  }

  return svgPath;
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {GraphNode} left
 * @param {GraphNode} right
 * @returns {number}
 */
function compareNodes(left, right) {
  return left.id.localeCompare(right.id);
}

/**
 * @param {GraphEdge} left
 * @param {GraphEdge} right
 * @returns {number}
 */
function compareEdges(left, right) {
  return `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`);
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function toModuleId(relativePath) {
  return relativePath.replace(/\.ts$/, "");
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function toLabel(relativePath) {
  if (relativePath.startsWith("shared/")) {
    return path.basename(relativePath, ".ts");
  }

  const workerPrefix = /^workers\/[^/]+\/src\//;
  if (workerPrefix.test(relativePath)) {
    return relativePath.replace(workerPrefix, "").replace(/\.ts$/, "");
  }

  return relativePath.replace(/\.ts$/, "");
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function toGroup(relativePath) {
  if (relativePath.startsWith("shared/")) {
    return "shared";
  }

  const match = /^workers\/([^/]+)\//.exec(relativePath);
  return match ? match[1] : "other";
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizePath(value) {
  return value.split(path.sep).join("/");
}

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeForCluster(value) {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_");
}

/**
 * @param {string} value
 * @returns {string}
 */
function quote(value) {
  return JSON.stringify(value);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
