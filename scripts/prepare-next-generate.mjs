import { copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";

const server = resolve(".next", "server");
async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
for (const suffix of ["", ".nft.json"]) {
  const middleware = join(server, `middleware.js${suffix}`);
  const proxy = join(server, `proxy.js${suffix}`);
  if (!(await exists(proxy)) && await exists(middleware)) await copyFile(middleware, proxy);
}
