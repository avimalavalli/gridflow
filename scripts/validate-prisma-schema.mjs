import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const schemaPath = resolve(root, "packages/database/prisma/schema.prisma");
const migrationsPath = resolve(root, "packages/database/prisma/migrations");
const migrationRegistryPath = resolve(root, "packages/database/src/migrations.ts");
const [schema, migrationRegistry, migrationEntries] = await Promise.all([
  readFile(schemaPath, "utf8"),
  readFile(migrationRegistryPath, "utf8"),
  readdir(migrationsPath, { withFileTypes: true }),
]);

const failures = [];
const modelPattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
for (const match of schema.matchAll(modelPattern)) {
  const model = match[1];
  const fields = new Map();
  for (const rawLine of match[2].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const field = line.split(/\s+/)[0];
    if (!/^[A-Za-z_]\w*$/.test(field)) continue;
    if (fields.has(field)) failures.push(`Model ${model} declares field ${field} more than once.`);
    fields.set(field, true);
  }
}

const directories = migrationEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const registered = [...migrationRegistry.matchAll(/"(\d{14}_[^"]+)"/g)].map((match) => match[1]).sort();
for (const name of directories) if (!registered.includes(name)) failures.push(`Migration ${name} exists but is not registered in migrations.ts.`);
for (const name of registered) if (!directories.includes(name)) failures.push(`Migration ${name} is registered but its directory is missing.`);

if (failures.length) {
  console.error("GridFlow database schema check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`GridFlow database schema check passed (${[...schema.matchAll(modelPattern)].length} models, ${directories.length} migrations).`);
