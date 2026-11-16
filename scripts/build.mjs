import { build } from "esbuild";
import { copyFileSync, chmodSync } from "node:fs";
await build({
  entryPoints: ["packages/cli/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: "packages/cli/dist/index.js",
  banner: { js: "#!/usr/bin/env node" },
});
chmodSync("packages/cli/dist/index.js", 0o755);
copyFileSync("README.md", "packages/cli/README.md");
const { writeFileSync, mkdirSync, unlinkSync } = await import("node:fs");
const { pathToFileURL } = await import("node:url");
const { resolve } = await import("node:path");
const { z } = await import("zod");
const { format } = await import("prettier");
mkdirSync("docs/schemas", { recursive: true });
for (const [name, entry, exportName] of [
  ["config", "packages/cli/src/config.ts", "schema"],
  ["memory", "packages/core/src/schema.ts", "recordSchema"],
  ["proposal", "packages/core/src/schema.ts", "proposalSchema"],
]) {
  const outfile = `packages/cli/dist/${name}-schema.mjs`;
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile,
  });
  const module = await import(pathToFileURL(resolve(outfile)).href);
  const json = await format(
    JSON.stringify(z.toJSONSchema(module[exportName])),
    { parser: "json" },
  );
  writeFileSync(`docs/schemas/${name}.schema.json`, json);
  writeFileSync(`packages/cli/dist/${name}.schema.json`, json);
  unlinkSync(outfile);
}

// Bundle runtime dependencies so generated host plugins do not depend on the checkout.
await build({
  entryPoints: ["packages/cli/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "packages/cli/dist/plugin-runtime.mjs",
  banner: {
    js: 'import { createRequire as __hippoCreateRequire } from "node:module"; const require = __hippoCreateRequire(import.meta.url);',
  },
});
copyFileSync(
  "plugins/shared/project-memory/SKILL.md",
  "packages/cli/dist/project-memory.md",
);
copyFileSync("LICENSE", "packages/cli/dist/LICENSE");
