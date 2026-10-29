import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  mkdir,
  writeFile,
  rm,
  cp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "featherlane-contracts-"));
const check = process.argv.includes("--check");
const snapshot = join(temporary, "contracts");
const generated = join(temporary, "generated");
const outputs = [
  [snapshot, resolve(root, "packages/contracts/schemas")],
  [generated, resolve(root, "packages/contracts/typescript/src/generated")],
];
function run(command, args, env = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code !== "ENOENT") throw error;
      throw new Error(
        `Missing generated output: ${relative(root, directory)}. Run pnpm setup:workspace (or pnpm contracts:generate) before pnpm contracts:check.`,
      );
    },
  );
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return groups.flat().sort();
}

try {
  if (check) await Promise.all(outputs.map(([, target]) => files(target)));
  run("uv", [
    "run",
    "--frozen",
    "--package",
    "featherlane-control-plane",
    "python",
    "-m",
    "featherlane_api.openapi.export",
    "--output",
    snapshot,
  ]);
  run("pnpm", ["exec", "openapi-ts"], {
    FLF_SCHEMA_INPUT: join(snapshot, "openapi.json"),
    FLF_CLIENT_OUTPUT: generated,
  });
  const schema = JSON.parse(
    await readFile(join(snapshot, "openapi.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(join(snapshot, "manifest.json"), "utf8"),
  );
  // Status schemas and route paths are derived, never maintained beside the DTOs.
  const operations = [];
  const binaryOperations = [];
  const navigations = [];
  for (const [path, item] of Object.entries(schema.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!operation.operationId)
        throw new Error(`Operation ID missing: ${method} ${path}`);
      if (operation["x-flf-transport"] === "navigation") {
        navigations.push(
          `${JSON.stringify(operation.operationId)}: { method: ${JSON.stringify(method.toUpperCase())}, path: ${JSON.stringify(path)} }`,
        );
        continue;
      }
      const responses = Object.entries(operation.responses).map(
        ([status, response]) => {
          if (status === "204" && response.content === undefined) {
            return `${JSON.stringify(status)}: null`;
          }
          if (
            operation["x-flf-transport"] === "binary-download" &&
            status === "200" &&
            response.content?.["application/octet-stream"]?.schema?.format ===
              "binary"
          ) {
            return `${JSON.stringify(status)}: null`;
          }
          const ref = response.content?.["application/json"]?.schema?.$ref;
          if (
            !/^\d{3}$/.test(status) ||
            !ref?.startsWith("#/components/schemas/")
          ) {
            throw new Error(
              `Unsupported response construct: ${operation.operationId}/${status}`,
            );
          }
          const name = ref.slice("#/components/schemas/".length);
          return `${JSON.stringify(status)}: validators.z${name}`;
        },
      );
      const destination = operation["x-flf-transport"]?.startsWith("binary-")
        ? binaryOperations
        : operations;
      destination.push(
        `${JSON.stringify(operation.operationId)}: { method: ${JSON.stringify(method.toUpperCase())}, path: ${JSON.stringify(path)}, responses: { ${responses.join(", ")} } }`,
      );
    }
  }
  await writeFile(
    join(generated, "policy.gen.ts"),
    `// Generated from OpenAPI by scripts/contracts.mjs. Do not edit.\nimport * as validators from './zod.gen';\nexport const contractManifest = ${JSON.stringify(manifest)} as const;\nexport const browserNavigationPolicies = { ${navigations.join(",")} } as const;\nexport const binaryTransportPolicies = { ${binaryOperations.join(",\n")} } as const;\nexport const operationPolicies = { ${operations.join(",\n")} } as const;\n`,
  );
  const generatedFiles = await files(generated);
  run("pnpm", [
    "exec",
    "prettier",
    "--ignore-path",
    "/dev/null",
    "--write",
    ...generatedFiles,
    join(snapshot, "manifest.json"),
  ]);
  for (const [source, target] of outputs) {
    if (check) {
      const expected = (await files(source)).map((p) => relative(source, p));
      const actual = (await files(target)).map((p) => relative(target, p));
      if (JSON.stringify(expected) !== JSON.stringify(actual))
        throw new Error(
          `Generated file set drift: ${target}. Run pnpm contracts:generate.`,
        );
      for (const name of expected) {
        if (
          !(await readFile(join(source, name))).equals(
            await readFile(join(target, name)),
          )
        ) {
          throw new Error(
            `Generated content drift: ${join(target, name)}. Run pnpm contracts:generate.`,
          );
        }
      }
    } else {
      await mkdir(target, { recursive: true });
      // Only these dedicated generated directories are replaced.
      await rm(target, { recursive: true });
      await cp(source, target, { recursive: true });
    }
  }
  console.log(
    check
      ? "Contract snapshots and generated client match."
      : "Contract snapshots and client generated.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
