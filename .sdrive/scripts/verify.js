#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { resolveGovernanceFile, resolveGovernanceDir } = require("./lib/governance-paths");
const { isResolved, resolutionOf } = require("./lib/resolution");

const projectRoot = process.cwd();

// ---------- Phase 1: Plan Reader ----------

function loadPlan(featureName, version) {
  const planPath = resolveGovernanceFile(projectRoot, featureName, version, "plan.json");

  if (!planPath) {
    console.error(`❌ plan.json not found for feature "${featureName}".`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(planPath, "utf8"));
}

function extractPlanItems(plan) {
  const items = [];

  (plan.architecture?.components || []).forEach((c) => {
    items.push({
      type: "component",
      name: c.name,
      action: c.action,
      resolution: isResolved(c) ? resolutionOf(c) : null
    });
  });

  (plan.apiContracts || []).forEach((api) => {
    items.push({
      type: "endpoint",
      // Endpoints have no name of their own; a readable one keeps the withdrawn list
      // legible instead of printing "(unnamed)".
      name: `${api.method} ${api.path}`,
      method: api.method,
      path: api.path,
      action: api.action,
      resolution: isResolved(api) ? resolutionOf(api) : null
    });
  });

  (plan.dataModel?.entities || []).forEach((entity) => {
    const entityResolution = isResolved(entity) ? resolutionOf(entity) : null;

    items.push({
      type: "entity",
      name: entity.name,
      action: entity.action,
      resolution: entityResolution
    });

    (entity.fields || []).forEach((field) => {
      items.push({
        type: "field",
        entity: entity.name,
        name: field.name,
        fieldType: field.type,
        action: field.action,
        // A field of a descoped entity is descoped with it. Without this the report
        // lists every column of a table that will never exist as "missing".
        resolution: entityResolution
      });
    });
  });

  (plan.dependencies || []).forEach((dep) => {
    items.push({
      type: "dependency",
      name: dep.name,
      action: dep.action,
      // `library` is the only dependency kind that is an installed artifact. `internal`,
      // `service`, and `external` describe relationships and access gates, so they can
      // never appear in a lockfile and must not be reported as missing.
      depType: dep.type || "library",
      resolution: isResolved(dep) ? resolutionOf(dep) : null
    });
  });

  return items;
}

// ---------- Phase 2: Code Scanner ----------

const CANDIDATE_ROOTS = [
  "src",
  "app",
  "lib",
  "pages",
  "server",
  // A pnpm workspace keeps the web app in client/ and the services in services/.
  // Neither was a candidate root, so every component under them was reported as
  // missing and verification.json could never leave "fail" in this repository.
  "client",
  "services",
  "internal",
  "cmd",
  "pkg",
  "api",
  "apps",
  "packages",
  "crates",
  "components",
  "messages",
  "locales",
  "i18n",
  "content"
];

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".expo",
  ".turbo",
  "coverage",
  "out",
  ".sdrive",
  ".cache",
  "vendor",
  // Installed third-party code is not this project's code. Without these, a Python
  // service's virtualenv was walked as source: `services/document-analyzer/.venv` alone
  // contributed roughly eleven thousand files, and FastAPI's own docstrings and its
  // bundled markdown skill references were read as the project's endpoints - `/users/me`,
  // `/items/`, `/login` and `/items/{item_id}` all appeared as detected API surface, and
  // a plan component named "AGENTS.md and README.md" was "renamed" to
  // `anthropic/resources/beta/agents/agents.py` inside the venv.
  ".venv",
  "venv",
  "site-packages",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox"
]);

const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".dart", ".java", ".kt",
  ".rb", ".php", ".cs", ".swift",
  ".css", ".scss", ".json",
  // Manifests and docs that a plan legitimately declares as `modify` components. They
  // are not source, but "this feature changed Cargo.toml / README.md" is a real,
  // checkable claim, and reporting it as missing because of its extension is wrong.
  ".toml", ".md", ".yml", ".yaml"
];

// Config files that are never feature components, even though they are JSON.
const IGNORED_FILES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "jsconfig.json",
  "components.json",
  "vercel.json",
  "next.config.json",
  "eslint.json",
  ".eslintrc.json",
  ".prettierrc.json"
]);

function readConstitutionSources() {
  const constitutionPath = path.join(projectRoot, ".sdrive", "constitution.md");

  if (!fs.existsSync(constitutionPath)) return [];

  const content = fs.readFileSync(constitutionPath, "utf8");
  const matches = content.match(/`([^`]+)`/g) || [];

  // A constitution names a source root in whichever shape the project's own
  // convention uses: `crates/*`, `crates/`, `src/components/`, `crates/<crate>/tests/`.
  // All of them mean the top-level directory to the scanner.
  //
  // The previous pattern required a literal slash immediately before the closing
  // backtick, so `crates/*` - the Cargo workspace convention, and the exact shape a
  // Rust project's constitution uses - never matched. Combined with `crates` being
  // absent from CANDIDATE_ROOTS, that made `sdrive verify` scan zero files in a
  // Rust workspace and report every planned component, entity, and field as missing.
  return matches
    .map((match) => match.replace(/`/g, "").trim())
    .map((declared) => declared.split(/[/\\]/)[0].replace(/\*+$/, ""))
    .filter((top) => top && CANDIDATE_ROOTS.includes(top));
}

function detectSourceRoots() {
  const fromConstitution = readConstitutionSources();
  const detected = CANDIDATE_ROOTS.filter((r) =>
    fs.existsSync(path.join(projectRoot, r))
  );

  // Union the constitution's declared roots with the conventional roots that
  // actually exist. Relying on the constitution alone misses real source
  // folders (e.g. lib/, messages/) that the document simply did not list.
  const roots = [...new Set([...fromConstitution, ...detected])];

  return roots.filter((r) => fs.existsSync(path.join(projectRoot, r)));
}

function walkDirectory(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (IGNORED_FILES.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(fullPath, files);
    } else if (CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function scanCode() {
  const roots = detectSourceRoots();

  if (roots.length === 0) {
    console.warn("⚠️  No source folders detected.");
    return { files: [], roots: [] };
  }

  console.log(`🔍 Scanning roots: ${roots.join(", ")}\n`);

  const files = [];
  roots.forEach((root) => {
    walkDirectory(path.join(projectRoot, root), files);
  });

  // A plan may name a repository-root file (README.md, AGENTS.md, render.yaml).
  // Those live in no source root, so walking the roots alone reported a component
  // that is plainly on disk as missing.
  fs.readdirSync(projectRoot, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isFile()) return;
    if (IGNORED_FILES.has(entry.name)) return;

    if (CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(path.join(projectRoot, entry.name));
    }
  });

  console.log(`📄 Found ${files.length} source files.\n`);

  return { files, roots };
}


// ---------- Phase 3: Diff Engine ----------

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return "";
  }
}

// Extracts `interface X { ... }` / `type X = { ... }` bodies by tracking brace depth.
// A non-greedy `\{([\s\S]*?)\}` stops at the first closing brace, so every field declared
// after a nested object literal was invisible: in `interface AiPlan`, the line
// `usage: { inputTokens: number, outputTokens: number };` closed the captured block, and
// the `analyzer` and `plan` fields declared below it were reported missing even though
// they are plainly written in the file.
function tsModelBlocks(content) {
  const blocks = [];
  const header =
    /(?:export\s+)?(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)\s*(?:<[^>{}]*>)?\s*(?:extends\s+[^{]+)?=?\s*\{/g;

  let match;

  while ((match = header.exec(content)) !== null) {
    const bodyStart = match.index + match[0].length;
    // The header consumed the opening brace, so the scan starts one level deep.
    // Starting at zero made the first nested `}` end the block - the same early exit
    // the old non-greedy regex had.
    let depth = 1;
    let end = bodyStart;

    for (; end < content.length; end++) {
      if (content[end] === "{") depth++;
      else if (content[end] === "}") {
        depth--;

        if (depth === 0) break;
      }
    }

    blocks.push({ name: match[1], body: content.slice(bodyStart, end) });
  }

  return blocks;
}

function detectComponents(files) {
  const components = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");
    const basename = path.basename(file, path.extname(file));

    // React / Vue / Svelte components
    const componentMatches = content.match(
      /(?:export\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]+)/
    );

    if (componentMatches && /components?\//i.test(relative)) {
      components.push({
        name: componentMatches[1],
        file: relative,
        basename
      });
    }

    // Every source file is also a valid "component" target when the plan
    // references it by path (e.g. "components/home/hero.tsx"). Plans commonly
    // name files rather than exported symbols, so record the path too.
    components.push({
      name: relative,
      file: relative,
      basename,
      isPath: true
    });
  });

  return components;
}

// ---------- Router mount resolution ----------
//
// A router declares its own relative paths (`router.post('/')`) and is mounted elsewhere
// with a prefix (`app.use('/api/workspaces', workspaceRoutes)`). A plan records the path a
// client actually calls, so a route declared as `/` under two mount hops can never equal
// `/api/workspaces/:slug/ai/plans` - the endpoint was reported missing even though the
// file declaring it had already matched. Prefixes are resolved through the import graph
// so the absolute form can be compared as well as the declared one.
function resolveImportedFile(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);

  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.js")
  ];

  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

function joinPaths(prefix, routePath) {
  const left = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const right = routePath.startsWith("/") ? routePath : `/${routePath}`;

  // `router.get('/')` under a mount IS the mount path. Appending would build a trailing
  // slash the plan never writes, so `/api/workspaces/:slug/ai/plans` stayed missing while
  // its sibling `/:id` matched.
  if (right === "/") return left === "" ? "/" : left;

  const joined = `${left}${right}`;

  return joined === "" ? "/" : joined;
}

// mountedFile -> [{ parentFile, prefix }]
function buildMountGraph(files) {
  const parents = new Map();

  files.forEach((file) => {
    const content = readFileContent(file);
    const localImports = new Map();

    const importMatches = content.matchAll(
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g
    );

    for (const match of importMatches) {
      const target = resolveImportedFile(file, match[2]);

      if (target) localImports.set(match[1], target);
    }

    const mountMatches = content.matchAll(
      /\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g
    );

    for (const match of mountMatches) {
      const child = localImports.get(match[2]);

      if (!child) continue;

      if (!parents.has(child)) parents.set(child, []);

      parents.get(child).push({ parentFile: file, prefix: match[1] });
    }
  });

  return parents;
}

function mountedPrefixes(file, parents, seen = new Set()) {
  const edges = parents.get(file);

  // A file nothing mounts is an entry point: its routes are already absolute.
  if (!edges || edges.length === 0 || seen.has(file)) return [""];

  const nextSeen = new Set(seen);

  nextSeen.add(file);

  const prefixes = [];

  edges.forEach((edge) => {
    mountedPrefixes(edge.parentFile, parents, nextSeen).forEach((parentPrefix) => {
      prefixes.push(joinPaths(parentPrefix, edge.prefix));
    });
  });

  return [...new Set(prefixes)];
}

// Adds an absolute form for every endpoint whose router is mounted somewhere. The
// declared relative path is kept too, because a project may legitimately record its
// endpoints the way the router declares them.
function applyMountedPaths(endpoints, files) {
  const parents = buildMountGraph(files);
  const byRelative = new Map();

  files.forEach((file) => {
    byRelative.set(path.relative(projectRoot, file).replace(/\\/g, "/"), file);
  });

  const synthesized = [];

  endpoints.forEach((endpoint) => {
    const absolute = byRelative.get(endpoint.file);

    if (!absolute) return;

    mountedPrefixes(absolute, parents).forEach((prefix) => {
      if (!prefix) return;

      const fullPath = joinPaths(prefix, endpoint.path);

      if (fullPath === endpoint.path) return;

      const known = endpoints.some(
        (e) => e.method === endpoint.method && e.path === fullPath
      );

      if (known) return;

      if (synthesized.some((e) => e.method === endpoint.method && e.path === fullPath)) return;

      // A derived path is not a claim the code makes, so it must never be reported as
      // unplanned work. It only exists to answer "does this plan path exist?".
      synthesized.push({
        ...endpoint,
        path: fullPath,
        resolved: true,
        declaredPath: endpoint.path
      });
    });
  });

  return endpoints.concat(synthesized);
}

function detectEndpoints(files) {
  const endpoints = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");

    // Express / Fastify / Koa
    const expressMatches = content.matchAll(
      /(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi
    );

    for (const match of expressMatches) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: relative
      });
    }

    // FastAPI / Flask
    const fastapiMatches = content.matchAll(
      /@(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi
    );

    for (const match of fastapiMatches) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: relative
      });
    }

    // Next.js API routes
    if (/pages\/api\//.test(relative)) {
      const route = relative.replace("pages/api", "").replace(/\.[jt]sx?$/, "");
      endpoints.push({
        method: "GET",
        path: `/api${route}`,
        file: relative
      });
    }
  });

  return applyMountedPaths(endpoints, files);
}

function detectEntities(files) {
  const entities = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");

    // SQL CREATE TABLE
    const sqlMatches = content.matchAll(/CREATE TABLE\s+(\w+)/gi);
    for (const match of sqlMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }

    // Prisma models
    const prismaMatches = content.matchAll(/model\s+(\w+)/g);
    for (const match of prismaMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }

    // Rust structs and enums, with or without `pub` and with any visibility
    // qualifier. A plan entity in a Rust crate is a type, so a declared entity was
    // invisible to this scanner until these patterns existed - every Rust model and
    // every one of its fields was reported as "missing" in a file that matched.
    const rustTypeMatches = content.matchAll(
      /\b(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum)\s+([A-Z]\w*)/g
    );
    for (const match of rustTypeMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }

    // TypeORM entities
    const typeormMatches = content.matchAll(/@Entity\([^)]*\)\s*class\s+(\w+)/g);
    for (const match of typeormMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }

    // TypeScript type aliases and interfaces (e.g. `export type Sector = {`
    // or `export interface Sector {`). These model the plan's data entities
    // in front-end projects that have no database layer.
    tsModelBlocks(content).forEach((block) => {
      entities.push({
        name: block.name,
        file: relative
      });
    });

    // Python classes, which is how a Pydantic request/response model or a dataclass
    // declares an entity. Every other stack this scanner knows about was covered
    // (SQL, Prisma, Mongoose, TypeORM, Rust, TypeScript) but not Python, so a Python
    // service's models were invisible and every entity and field inside them was
    // reported missing while the file declaring them had already matched.
    const pythonClassMatches = content.matchAll(
      /^class\s+([A-Z]\w*)\s*(?:\([^)]*\))?\s*:/gm
    );

    for (const match of pythonClassMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }
  });

  return entities;
}

function detectFields(files) {
  const fields = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");

    // Rust struct fields: `pub name: Type,` inside a `struct Name { ... }` body, which
    // is how a plan's entity fields are written in Rust. Generics such as `Option<T>`
    // and `Vec<T>` are captured as-is; only the field name is used for matching, so the
    // type spelling (`usize`, `String`, `Option<String>`) never affects the result.
    //
    // This is parsed line by line rather than with one regular expression because a
    // field is not required to end in a comma - the last field in a struct often does
    // not - and a pattern that insists on one silently drops that field while its
    // siblings match.
    const rustStructs = content.matchAll(
      /\b(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Z]\w*)[^;{]*\{([\s\S]*?)\n\s*\}/g
    );

    for (const block of rustStructs) {
      const rustEntity = block[1];

      for (const rawLine of block[2].split(/\r?\n/)) {
        // Drop a trailing inline comment, then attributes and blank lines.
        const line = rawLine.replace(/\/\/.*$/, "").trim();

        if (!line || line.startsWith("#")) continue;

        const field = line.match(
          /^(?:pub(?:\([^)]*\))?\s+)?([a-z_]\w*)\s*:\s*(.+?),?\s*$/
        );

        if (!field) continue;

        fields.push({
          entity: rustEntity,
          name: field[1],
          file: relative
        });
      }
    }

    // SQL fields inside CREATE TABLE
    const tableBlocks = content.matchAll(
      /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\)/gi
    );

    for (const block of tableBlocks) {
      const entity = block[1];
      const body = block[2];

      const fieldMatches = body.matchAll(/^\s*(\w+)\s+\w+/gm);

      for (const field of fieldMatches) {
        fields.push({
          entity,
          name: field[1],
          file: relative
        });
      }
    }

    // Prisma fields
    const prismaBlocks = content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g);

    for (const block of prismaBlocks) {
      const entity = block[1];
      const body = block[2];

      const fieldMatches = body.matchAll(/^\s*(\w+)\s+\w+/gm);

      for (const field of fieldMatches) {
        fields.push({
          entity,
          name: field[1],
          file: relative
        });
      }
    }

    // TypeScript type/interface fields (e.g. `id: string;` inside a type).
    // Matches `name: Type` and optional `name?: Type` property declarations.
    tsModelBlocks(content).forEach((block) => {
      const fieldMatches = block.body.matchAll(/^\s*(\w+)\??\s*:\s*([^;\n]+)/gm);

      for (const field of fieldMatches) {
        fields.push({
          entity: block.name,
          name: field[1],
          file: relative
        });
      }
    });
    // Python model fields, e.g. `contractVersion: Literal[1]` inside a Pydantic class.
    // Only lines at the class body's own indent are read, so a local variable or a
    // parameter inside a method body is never mistaken for a field.
    let pythonEntity = null;
    let pythonBodyIndent = 0;

    content.split(/\r?\n/).forEach((rawLine) => {
      const trimmedLine = rawLine.trim();

      if (!trimmedLine) return;

      const indent = rawLine.length - rawLine.trimStart().length;
      const classMatch = rawLine.match(/^(\s*)class\s+([A-Z]\w*)\s*(?:\([^)]*\))?\s*:/);

      if (classMatch) {
        pythonEntity = classMatch[2];
        pythonBodyIndent = 0;
        return;
      }

      if (pythonEntity === null) return;

      // A dedent to column zero ends the class.
      if (indent === 0) {
        pythonEntity = null;
        return;
      }

      if (pythonBodyIndent === 0) pythonBodyIndent = indent;

      if (indent !== pythonBodyIndent) return;
      if (trimmedLine.startsWith("@")) return;
      if (trimmedLine.startsWith("def ")) return;
      if (trimmedLine.startsWith("#")) return;
      if (trimmedLine.startsWith('"""') || trimmedLine.startsWith("'''")) return;

      const field = trimmedLine.match(/^([a-zA-Z_]\w*)\s*:\s*\S/);

      if (!field) return;

      fields.push({
        entity: pythonEntity,
        name: field[1],
        file: relative
      });
    });
  });

  return fields;
}

// Dependencies that are satisfied without appearing in package.json. These are
// virtual/registry-based or bundled toolchains (e.g. shadcn/ui is a CLI that
// copies components into the repo rather than a runtime dependency).
const VIRTUAL_DEPENDENCIES = new Set([
  "shadcn/ui",
  "shadcn",
  "tailwind",
  "tailwindcss",
  "radix-ui",
  "radix",
  "lucide",
  "lucide-react"
]);

// Dependency names declared by a Cargo manifest: `[dependencies]`, `[dev-dependencies]`,
// `[build-dependencies]`, and their `workspace.` forms.
function cargoDependencyNames(file) {
  const content = readFileContent(file);
  const names = [];
  let collecting = false;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.startsWith("[")) {
      collecting = /^\[(?:workspace\.)?(?:dev-|build-)?dependencies\]$/.test(trimmed);
      continue;
    }

    if (!collecting) continue;

    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*=/);

    if (match) names.push(match[1]);
  }

  return names;
}

// Dependency names declared by a PEP 621 `pyproject.toml`: the `dependencies` array and
// every group under `[project.optional-dependencies]`. Modern Python projects declare
// nothing in `requirements.txt`, so before this a Python dependency was invisible and
// every one of them was reported missing - `documind`, `fastapi`, `uvicorn` and
// `pydantic` were all in `services/document-analyzer/pyproject.toml` and all reported
// as absent from the repository.
function pyprojectDependencyNames(file) {
  const content = readFileContent(file);
  const names = [];
  let section = "";
  let collecting = false;

  const takeSpecs = (text) => {
    const quoted = text.match(/"[^"]*"|'[^']*'/g) || [];

    quoted.forEach((raw) => {
      const spec = raw.slice(1, -1).trim();

      if (!spec) return;

      // `uvicorn[standard]>=0.30,<1.0` is the `uvicorn` distribution.
      const name = spec.split(/[\s<>=!~;([\]]/)[0].trim();

      if (name) names.push(name);
    });
  };

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const header = trimmed.match(/^\[([^\]]+)\]\s*$/);

    if (header) {
      section = header[1];
      collecting = false;
      continue;
    }

    if (section === "project" && /^dependencies\s*=/.test(trimmed)) {
      collecting = true;
    } else if (
      section === "project.optional-dependencies" &&
      /^[\w.-]+\s*=/.test(trimmed)
    ) {
      collecting = true;
    }

    if (!collecting) continue;

    takeSpecs(trimmed);

    // A bracket inside a quoted requirement (`uvicorn[standard]>=0.30`) is not an array
    // delimiter. Counting it closed the array two entries early, which is why
    // `pydantic` was reported missing from a manifest that plainly declares it.
    const unquoted = trimmed.replace(/"[^"]*"|'[^']*'/g, "");
    const depth =
      (unquoted.match(/\[/g) || []).length - (unquoted.match(/\]/g) || []).length;

    if (unquoted.includes("]") && depth <= 0) collecting = false;
  }

  return names;
}

// Dependencies come from whatever manifest the project actually has.
//
// This read `package.json` only, so in a Rust, Python, or Go project every declared
// library dependency was reported as missing - and a `missing` count keeps
// `verification.json` at "fail" no matter what the code does. The unconditional early
// return also skipped every check when there was no `package.json` at all.
function detectDependencies(sourceRoots = []) {
  const names = new Set();

  const pkgPath = path.join(projectRoot, "package.json");

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      Object.keys(pkg.dependencies || {}).forEach((name) => names.add(name));
      Object.keys(pkg.devDependencies || {}).forEach((name) => names.add(name));
    } catch (error) {
      // A broken package.json is not a dependency answer; keep looking elsewhere.
    }
  }

  // Rust: the workspace manifest plus each member manifest one level down.
  const cargoFiles = [path.join(projectRoot, "Cargo.toml")];

  for (const root of sourceRoots) {
    const rootDir = path.join(projectRoot, root);

    cargoFiles.push(path.join(rootDir, "Cargo.toml"));

    if (!fs.existsSync(rootDir)) continue;

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      if (entry.isDirectory()) cargoFiles.push(path.join(rootDir, entry.name, "Cargo.toml"));
    }
  }

  cargoFiles
    .filter((file) => fs.existsSync(file))
    .forEach((file) => cargoDependencyNames(file).forEach((name) => names.add(name)));

  // Python: modern projects declare in `pyproject.toml`, not `requirements.txt`.
  const pyprojects = [path.join(projectRoot, "pyproject.toml")];

  for (const root of sourceRoots) {
    const rootDir = path.join(projectRoot, root);

    if (!fs.existsSync(rootDir)) continue;

    pyprojects.push(path.join(rootDir, "pyproject.toml"));

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        pyprojects.push(path.join(rootDir, entry.name, "pyproject.toml"));
      }
    }
  }

  pyprojects
    .filter((file) => fs.existsSync(file))
    .forEach((file) => pyprojectDependencyNames(file).forEach((name) => names.add(name)));

  // Python
  const requirements = path.join(projectRoot, "requirements.txt");

  if (fs.existsSync(requirements)) {
    readFileContent(requirements)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => names.add(line.split(/[<>=!~[ ]/)[0]));
  }

  return [...names];
}

function diffPlanAgainstCode(planItems, code) {
  const matched = [];
  const missing = [];
  const renamed = [];
  const extra = [];
  const withdrawn = [];
  // Files already accounted for by a matched or renamed item. A rename must never
  // claim a file that another plan item already owns.
  const claimedFiles = new Set();

  const codeComponents = detectComponents(code.files);
  const codeEndpoints = detectEndpoints(code.files);
  const codeEntities = detectEntities(code.files);
  const codeFields = detectFields(code.files);
  const codeDependencies = detectDependencies(code.roots);

  // Expand brace globs such as "messages/{fr,pt,es}.json" into concrete paths
  // so a plan that groups sibling files still matches the real files on disk.
  const expandBraces = (pattern) => {
    const match = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);

    if (match) {
      return match[2]
        .split(",")
        .map((part) => `${match[1]}${part.trim()}${match[3]}`);
    }

    // The same grouping is also written without braces - "locales/en,fr,ar/aiPlan.json"
    // names the three locale files, all of which exist. Without this the item matched no
    // file and was reported as a rename onto one sibling.
    const listMatch = pattern.match(/^(.*\/)([^/]*,[^/]*)(\/.*)?$/);

    if (listMatch) {
      return listMatch[2]
        .split(",")
        .map((part) => `${listMatch[1]}${part.trim()}${listMatch[3] || ""}`);
    }

    return [pattern];
  };

  // A plan item matches a code component when the names are equal, when the
  // plan names the file path directly, or when the plan uses a brace glob that
  // expands to the file path.
  const componentMatches = (item, c) => {
    if (c.name === item.name || c.file === item.name) return true;
    if (item.name.includes("{") || item.name.includes(",")) {
      return expandBraces(item.name).some((p) => p === c.file || p === c.name);
    }
    return false;
  };

  planItems.forEach((item) => {
    // A descoped plan item is not missing work - it was decided not to exist. Reporting
    // it as "missing" is what makes a bundled feature that lost one leg unarchivable:
    // the count can never reach zero, so `verification.json` stays "fail" forever and
    // `approve implementation` refuses on evidence nobody can produce.
    if (item.resolution) {
      withdrawn.push({ ...item, reason: item.resolution.reason, kind: item.resolution.kind });
      return;
    }

    if (item.type === "component") {
      // Plans may reference a component either by exported symbol name
      // ("Hero") or by file path ("components/home/hero.tsx"). Match both.
      const found = codeComponents.find((c) => componentMatches(item, c));

      if (found) {
        matched.push({ ...item, file: found.file });
        claimedFiles.add(found.file);
      } else if (
        // A plan may name a directory ("services/document-analyzer") when the change
        // is the package as a whole. The scanner only indexes files, so that item was
        // reported as missing even though the directory existed.
        !item.name.includes("{") &&
        fs.existsSync(path.join(projectRoot, item.name)) &&
        fs.statSync(path.join(projectRoot, item.name)).isDirectory()
      ) {
        matched.push({ ...item, file: item.name });
      } else if (
        // A plan may also name a real file whose extension the scanner does not index.
        // `services/api/.env.example` exists on disk, but `.example` is not a code
        // extension, so the file was never indexed and the plan item was reported missing.
        !item.name.includes("{") &&
        fs.existsSync(path.join(projectRoot, item.name)) &&
        fs.statSync(path.join(projectRoot, item.name)).isFile()
      ) {
        matched.push({ ...item, file: item.name });
      } else {
        // A rename claims that a similar file IS this plan item under another name.
        // The old test compared the first five characters of the whole path against
        // every code path, so `crates/wirekit/Cargo.toml` "matched"
        // `crates/dado/src/diag.rs` (both begin "crate"), and one file could be
        // claimed by several items. A rename now needs a similar *basename* and a file
        // no other item has claimed; otherwise the item is honestly missing.
        const stem = path.basename(item.name, path.extname(item.name)).toLowerCase();

        const similar = codeComponents.find((c) => {
          if (c.isPath !== true) return false;
          if (claimedFiles.has(c.file)) return false;

          const candidateStem = path.basename(c.name, path.extname(c.name)).toLowerCase();

          if (!candidateStem || !stem) return false;

          return (
            candidateStem === stem ||
            candidateStem.startsWith(stem) ||
            stem.startsWith(candidateStem)
          );
        });

        if (similar && similar.file !== item.name) {
          renamed.push({ ...item, to: similar.name, file: similar.file });
          claimedFiles.add(similar.file);
        } else {
          missing.push(item);
        }
      }
    }

    if (item.type === "endpoint") {
      const found = codeEndpoints.find(
        (e) => e.method === item.method && e.path === item.path
      );

      if (found) {
        matched.push({ ...item, file: found.file });
      } else {
        missing.push(item);
      }
    }

    if (item.type === "entity") {
      const found = codeEntities.find((e) => e.name === item.name);

      if (found) {
        matched.push({ ...item, file: found.file });
      } else {
        missing.push(item);
      }
    }

    if (item.type === "field") {
      const found = codeFields.find(
        (f) => f.entity === item.entity && f.name === item.name
      );

      if (found) {
        matched.push({ ...item, file: found.file });
      } else {
        missing.push(item);
      }
    }

    if (item.type === "dependency") {
      // A non-library dependency cannot be verified against a manifest, and saying it is
      // "missing" is a false accusation that keeps verification at `fail` forever: an
      // internal reuse of another crate, a partner agreement, or a live-use access gate
      // has no package name to find. It is recorded as matched with a note instead.
      if (item.depType && item.depType !== "library") {
        matched.push({ ...item, note: `${item.depType} dependency; not manifest-verifiable` });
      } else if (
        codeDependencies.includes(item.name) ||
        VIRTUAL_DEPENDENCIES.has(item.name.toLowerCase())
      ) {
        matched.push(item);
      } else {
        missing.push(item);
      }
    }
  });

  // Extra code detection. Only files that live in a folder the plan itself
  // declares are candidates for "unplanned work". A plan for one feature does
  // not own every file in the repository, so pre-existing files from other
  // features (and vendored primitives such as components/ui/*) must not be
  // reported as extra. This keeps the signal focused on genuinely surprising
  // additions inside the feature's own area.
  //
  // A folder counts as feature-owned only when the plan creates a new file in
  // it. Folders the plan merely modifies (e.g. app/[locale]/, messages/) are
  // shared infrastructure that legitimately contains sibling files the plan
  // never mentions.
  const plannedFolders = new Set(
    planItems
      .filter(
        (p) =>
          p.type === "component" &&
          p.name.includes("/") &&
          (p.action || "").toLowerCase() === "create"
      )
      .map((p) => p.name.split("/").slice(0, -1).join("/"))
      .filter(Boolean)
  );

  codeComponents.forEach((c) => {
    if (!c.isPath) return;
    if (!plannedFolders.has(c.file.split("/").slice(0, -1).join("/"))) return;

    const inPlan = planItems.some(
      (p) => p.type === "component" && componentMatches(p, c)
    );

    if (!inPlan) {
      extra.push({ type: "component", name: c.name, file: c.file });
    }
  });

  codeEndpoints.forEach((e) => {
    // A path synthesized from a router's mount prefix is not a claim the code makes,
    // so it is never reported as unplanned work.
    if (e.resolved) return;

    if (!planItems.some((p) => p.type === "endpoint" && p.path === e.path)) {
      extra.push({ type: "endpoint", method: e.method, path: e.path, file: e.file });
    }
  });

  return { matched, missing, renamed, extra, withdrawn };
}


// ---------- Phase 4: Report Writer ----------

function determineStatus(result) {
  if (result.missing.length > 0) return "fail";
  if (result.renamed.length > 0) return "fail";
  if (result.extra.length > 0) return "warn";
  // Nothing matched and nothing is missing means every declared item was descoped.
  // That is not a verified feature, so it cannot report "pass" on an empty diff.
  if (result.withdrawn.length > 0 && result.matched.length === 0) return "warn";
  return "pass";
}

function writeReport(featureName, result, version) {
  const status = determineStatus(result);

  const report = {
    feature: featureName,
    status,
    checkedAt: new Date().toISOString(),
    summary: {
      matched: result.matched.length,
      missing: result.missing.length,
      renamed: result.renamed.length,
      extra: result.extra.length,
      withdrawn: result.withdrawn.length
    },
    items: {
      matched: result.matched,
      missing: result.missing,
      renamed: result.renamed,
      extra: result.extra,
      withdrawn: result.withdrawn
    }
  };

  // Write alongside the plan we verified, so the report lands in the same
  // version folder (falling back to the flat layout for older projects).
  const reportDir = resolveGovernanceDir(projectRoot, featureName, version);
  const reportPath = path.join(reportDir, "verification.json");

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return { status, reportPath };
}


// ---------- Entry ----------

const featureName = process.argv[2];
const version = process.argv[3];

if (!featureName) {
  console.error("❌ Usage: node verify.js <feature-name> [version]");
  process.exit(1);
}

const plan = loadPlan(featureName, version);
const planItems = extractPlanItems(plan);
const code = scanCode();

const result = diffPlanAgainstCode(planItems, code);
const { status, reportPath } = writeReport(featureName, result, version);

console.log("\n📊 Verification Result\n");
console.log(`✅ Matched:   ${result.matched.length}`);
console.log(`❌ Missing:   ${result.missing.length}`);
console.log(`⏸️  Withdrawn: ${result.withdrawn.length}`);
console.log(`⚠️  Renamed:  ${result.renamed.length}`);
console.log(`➕ Extra:     ${result.extra.length}`);
console.log(`\n🧾 Status:    ${status.toUpperCase()}`);
console.log(`📁 Report:    ${path.relative(projectRoot, reportPath)}\n`);

// A field is only meaningful with its entity: "row" says nothing on its own, while
// "AngiImportOutcome.row" says which model is missing it - and makes a rename obvious.
const labelItem = (item) =>
  item.type === "field" ? `${item.entity}.${item.name}` : item.name || item.path || "";

if (result.withdrawn.length > 0) {
  console.log("⏸️  Withdrawn (descoped, not missing):");
  result.withdrawn.forEach((i) => {
    console.log(`  [${i.type}] ${labelItem(i)} - ${i.reason}`);
  });
  console.log("");
}

if (result.missing.length > 0) {
  console.log("❌ Missing:");
  result.missing.forEach((i) => {
    console.log(`  [${i.type}] ${labelItem(i)}`);
  });
}

if (result.renamed.length > 0) {
  console.log("\n⚠️  Renamed:");
  result.renamed.forEach((i) => {
    console.log(`  [${i.type}] ${i.name} → ${i.to}`);
  });
}

if (result.extra.length > 0) {
  console.log("\n➕ Extra (not in plan):");
  result.extra.forEach((i) => {
    console.log(`  [${i.type}] ${i.name || i.path}`);
  });
}

process.exit(status === "fail" ? 1 : 0);

module.exports = {
  loadPlan,
  extractPlanItems,
  scanCode,
  diffPlanAgainstCode,
  writeReport
};