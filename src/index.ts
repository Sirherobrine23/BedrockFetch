#!/usr/bin/env node
import { Github } from "@sirherobrine23/http";
import { compareVersions } from "compare-versions";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { bedrockSchema, find, keys } from "./find.js";

const gh = await Github.repositoryManeger("Sirherobrine23", "BedrockFetch");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionPath = path.resolve(__dirname, "../versions");
const allPath = path.join(versionPath, "all.json");
let __versions: bedrockSchema[] = JSON.parse(await fs.readFile(allPath, "utf8"));
__versions = __versions.sort((b, a) => compareVersions(a.version, b.version));
const versions = new Map<string, Omit<bedrockSchema, "version">>(__versions.map(v => ([v.version, { date: v.date, release: v.release, url: v.url }])));

console.log("Finding new server versions");
const newVersions = await find();
let upload = false;
for (const rel of newVersions) {
  if (versions.has(rel.version)) {
    console.log("%s are added in database", rel.version);
    continue;
  }
  const release = await gh.release.manegerRelease(rel.version, {
    type: rel.release === "preview" ? "preRelease" : undefined,
    releaseName: rel.version,
    releaseBody: ([
      `# ${rel.release} ${rel.version} ${rel.date.toUTCString()}`,
      "",
      `Auto fetch Minecraft bedrock server and release to Public, By @Sirherobrine23 and Github actions`
    ]).join("\n"),
  });
  console.log("Add %s to versions", rel.version);
  if (!upload && process.env.GITHUB_ENV) {
    const githubEnv = path.resolve(process.env.GITHUB_ENV);
    upload = true;
    await fs.writeFile(githubEnv, `VERSION=${rel.version}\nUPLOAD=true`);
  }
  await Promise.all(keys(rel.url).map(platform => keys(rel.url[platform]).map(arch => keys(rel.url[platform][arch]).map(async file => {
    const basename = path.basename(rel.url[platform][arch][file]);
    const fileStats = await fs.lstat(rel.url[platform][arch][file]);
    await finished(createReadStream(rel.url[platform][arch][file]).pipe(release.uploadAsset(basename, fileStats.size)));
    rel.url[platform][arch][file] = `https://github.com/Sirherobrine23/BedrockFetch/releases/download/${rel.version}/${basename}`;
  }))).flat(3));
  versions.set(rel.version, {
    date: rel.date,
    release: rel.release,
    url: rel.url
  });
}

const vers = Array.from(versions.keys()).sort((b, a) => compareVersions(a, b)).map(v => ({ version: v, ...(versions.get(v)) }));
await fs.writeFile(allPath, JSON.stringify(vers, null, 2));
await Promise.all(Array.from(versions.keys()).map(async ver => fs.writeFile(path.join(versionPath, `${ver}.json`), JSON.stringify({ version: ver, ...(versions.get(ver)) }, null, 2))));