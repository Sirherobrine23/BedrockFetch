#!/usr/bin/env node
import { Github } from "@sirherobrine23/http";
import AdmZip from "adm-zip";
import { compareVersions } from "compare-versions";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import tar from "tar";
import { bedrockSchema, find, keys } from "./find.js";

process.on("rejectionHandled", err => console.error(err));
process.on("unhandledRejection", err => console.error(err));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionPath = path.resolve(__dirname, "../versions");
const allPath = path.join(versionPath, "all.json");
const gh = await Github.repositoryManeger("Sirherobrine23", "BedrockFetch", { token: process.env.GITHUB_TOKEN });

const __versions: bedrockSchema[] = JSON.parse(await fs.readFile(allPath, "utf8"));
const versions = new Map<string, Omit<bedrockSchema, "version">>(__versions.sort((b, a) => compareVersions(a.version, b.version)).map(v => ([v.version, { date: v.date, release: v.release, url: v.url }])));

console.log("Finding new server versions");
const remoteURLs = await find();

for (const remoteURL of remoteURLs) {
  if (versions.has(remoteURL.version)) {
    console.log("Skiping %s so added to Releases and Versions!");
    continue;
  }

  const release = await gh.release.manegerRelease(remoteURL.version, {
    type: remoteURL.release === "preview" ? "preRelease" : undefined,
    releaseName: remoteURL.version,
    releaseBody: ([`# ${remoteURL.date.toUTCString()} ${remoteURL.version}`, "",]).join("\n"),
  });

  await Promise.all(keys(remoteURL.url).map(platform => keys(remoteURL.url[platform]).map(async (arch) => {
    const filePath = remoteURL.url[platform][arch].zip;
    const zipStats = await fs.lstat(filePath);
    await pipeline(createReadStream(filePath), release.uploadAsset(`${platform}_${arch}.zip`, zipStats.size).on("fileAssest", (rel: Github.githubRelease["assets"][number]) => remoteURL.url[platform][arch].zip = rel.browser_download_url));

    const folderPath = filePath.slice(0, -4);
    const tgzPath = folderPath + ".tgz";
    await new Promise<void>((done, reject) => (new AdmZip(filePath)).extractAllToAsync(folderPath, true, true, err => err ? reject(err) : done()));
    await tar.create({
      gzip: true,
      file: tgzPath,
      cwd: folderPath,
    }, await fs.readdir(folderPath));

    const tgzStats = await fs.lstat(tgzPath);
    await pipeline(createReadStream(tgzPath), release.uploadAsset(`${platform}_${arch}.tgz`, tgzStats.size).on("fileAssest", (rel: Github.githubRelease["assets"][number]) => remoteURL.url[platform][arch].tgz = rel.browser_download_url));

    for (const ff of ([tgzPath, filePath, folderPath])) await fs.rm(ff, { recursive: true, force: true });
  })).flat(3))

  if (process.env.GITHUB_ENV) await fs.writeFile(path.resolve(process.env.GITHUB_ENV), `VERSION=${remoteURL.version}\nUPLOAD=true`);
  versions.set(remoteURL.version, {
    date: remoteURL.date,
    release: remoteURL.release,
    url: remoteURL.url
  });
  await fs.writeFile(versionPath, JSON.stringify(Array.from(versions.keys()).sort(compareVersions).map(version => Object.assign({ version }, versions.get(version))), null, 2));
}

await Promise.all(Array.from(versions.keys()).map(async key => fs.writeFile(path.join(versionPath, key + ".json"), JSON.stringify(Object.assign({ version: key }, versions.get(key)), null, 2))));