#!/usr/bin/env node
import { Github } from "@sirherobrine23/http";
import AdmZip from "adm-zip";
import { compareVersions } from "compare-versions";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tar from "tar";
import { bedrockSchema, find, keys } from "./find.js";

function errCatch(err) {
  console.error(err);
  process.exitCode = -1;
}
process.on("rejectionHandled", errCatch);
process.on("unhandledRejection", errCatch);

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
    console.log("Skiping %s so added to Releases and Versions!", remoteURL.version);
    continue;
  }

  console.log("Creating %s release", remoteURL.version);
  const release = await gh.release.manegerRelease(remoteURL.version, {
    type: remoteURL.release === "preview" ? "preRelease" : undefined,
    releaseName: remoteURL.version,
    releaseBody: ([`# ${remoteURL.date.toUTCString()} ${remoteURL.version}`, "",]).join("\n"),
  });
  console.log("Created %s", remoteURL.version);

  async function uploadAssest(filePath: string, assestName = path.basename(filePath)) {
    return new Promise<Github.githubRelease["assets"][number]>(async (done, reject) => {
      if (release.getLocaAssets()[assestName]) return done(release.getLocaAssets()[assestName]);
      const fileStats = await fs.lstat(filePath);
      createReadStream(filePath).pipe(release.uploadAsset(assestName, fileStats.size).on("fileAssest", done)).on("error", reject);
    });
  }

  await Promise.all(keys(remoteURL.url).map(platform => keys(remoteURL.url[platform]).map(async (arch) => {
    let remoteName = `${platform}_${arch}.zip`;
    const filePath = remoteURL.url[platform][arch].zip;
    console.log("Uploading %s %O", remoteURL.version, remoteName);
    remoteURL.url[platform][arch].zip = (await uploadAssest(filePath, remoteName)).browser_download_url;
    console.log("done uploaded %s %O", remoteURL.version, remoteName);

    const folderPath = filePath.slice(0, -4);
    const tgzPath = folderPath + ".tgz";
    await new Promise<void>((done, reject) => (new AdmZip(filePath)).extractAllToAsync(folderPath, true, true, err => err ? reject(err) : done()));
    await tar.create({
      gzip: true,
      file: tgzPath,
      cwd: folderPath,
    }, await fs.readdir(folderPath));

    remoteName = `${platform}_${arch}.tgz`;
    console.log("Uploading %s %O", remoteURL.version, remoteName);
    remoteURL.url[platform][arch].tgz = (await uploadAssest(tgzPath, remoteName)).browser_download_url;
    console.log("done uploaded %s %O", remoteURL.version, remoteName);

    for (const ff of ([tgzPath, filePath, folderPath])) await fs.rm(ff, { recursive: true, force: true });
  })).flat(3))

  if (process.env.GITHUB_ENV) await fs.writeFile(path.resolve(process.env.GITHUB_ENV), `VERSION=${remoteURL.version}\nUPLOAD=true`);
  versions.set(remoteURL.version, {
    date: remoteURL.date,
    release: remoteURL.release,
    url: remoteURL.url
  });
  await fs.writeFile(allPath, JSON.stringify(Array.from(versions.keys()).sort(compareVersions).reverse().map(version => Object.assign({ version }, versions.get(version))), null, 2));
}

await Promise.all(Array.from(versions.keys()).map(async key => fs.writeFile(path.join(versionPath, key + ".json"), JSON.stringify(Object.assign({ version: key }, versions.get(key)), null, 2))));