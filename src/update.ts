#!/usr/bin/env node
import { compareVersions } from "compare-versions";
import { find, bedrockSchema } from "./find";
import { extendFs, httpRequestLarge } from "@the-bds-maneger/core-utils";
import path from "node:path";
import fs from "node:fs/promises";
const allPath = path.join(__dirname, "../versions/all.json");

main().then(console.log);
async function main() {
  const all: bedrockSchema[] = JSON.parse(await fs.readFile(allPath, "utf8"));
  const data = await find();
  if (!data) return null;
  // Add to all
  if (!all.some(version => version.version === data.version)) {
    // Write env
    if (process.env.GITHUB_ENV) {
      const githubEnv = path.resolve(process.env.GITHUB_ENV);
      await fs.writeFile(githubEnv, `VERSION=${data.version}\nUPLOAD=true`);
      // 'downloadFiles' path
      const onSave = path.resolve(__dirname, "../downloadFiles");
      if (!await extendFs.exists(onSave)) await fs.mkdir(onSave, {recursive: true});
      for (const platform of Object.keys(data.url)) {
        for (const keyName of Object.keys(data.url[platform])) {
          const downloadData = {url: data.url[platform][keyName], name: `${platform}_${keyName}_${path.basename((new URL(data.url[platform][keyName])).pathname)}`};
          await httpRequestLarge.saveFile({
            url: downloadData.url,
            filePath: path.join(onSave, downloadData.name)
          });
          data.url[platform][keyName] = `https://github.com/The-Bds-Maneger/BedrockFetch/releases/download/${data.version}/${downloadData.name}`;
        }
      }
    }

    all.push(data);
  }
  const filePath = path.join(__dirname, "../versions", `${data.version}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  await fs.writeFile(allPath, JSON.stringify(all.sort((a, b) => compareVersions(a.version, b.version)), null, 2));
  return data;
}