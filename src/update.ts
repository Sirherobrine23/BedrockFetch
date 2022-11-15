#!/usr/bin/env node
import { extendFs } from "@the-bds-maneger/core-utils";
import { compareVersions } from "compare-versions";
import { find, bedrockSchema } from "./find";
import path from "node:path";
import fs from "node:fs/promises";
const allPath = path.join(__dirname, "../versions/all.json");

main();
async function main() {
  const all: bedrockSchema[] = JSON.parse(await fs.readFile(allPath, "utf8"));
  const data = await find();
  if (!data) return;
  const filePath = path.join(__dirname, "../versions", `${data.version}.json`);
  if (await extendFs.exists(filePath)) return;
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  // Add to all
  all.push(data);
  await fs.writeFile(allPath, JSON.stringify(all.sort((a, b) => compareVersions(a.version, b.version)), null, 2));
}