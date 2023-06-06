import { http } from "@sirherobrine23/http";
import AdmZip from "adm-zip";
import { compareVersions } from "compare-versions";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import streamConsumer from "node:stream/promises";
import tar from "tar";

export type bedrockSchema = {
  version: string,
  date: Date,
  release?: "oficial" | "preview",
  url: {
    [platform in NodeJS.Platform]?: {
      [arch in NodeJS.Architecture]?: {
        [ext in "tgz" | "zip"]?: string;
      }
    }
  }
};

export const keys = <T>(arg0: T): (keyof T)[] => Object.keys(arg0) as any;

export async function find() {
  const minecraftUrls = (await http.htmlURLs("https://www.minecraft.net/en-us/download/server/bedrock", {
    headers: {
      "upgrade-insecure-requests": "1",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "sec-ch-ua": "\"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"114\", \"Google Chrome\";v=\"114\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-site": "none",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
      "sec-fetch-dest": "document",
      // "accept-encoding": "gzip, deflate, br",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  })).body.filter(Link => /bin-.*\.zip/.test(Link));
  const objURLs = minecraftUrls.reduce<{ [ver: string]: bedrockSchema["url"] }>((mount, url) => {
    // get version
    let mcpeVersion = url;
    const regReplace = /((^http[s]:\/\/[a-z\.]+\/bin-[a-zA-Z0-9\-]+\/)|(\.zip$)|([a-zA-Z\-]+))/;
    while (regReplace.test(mcpeVersion)) mcpeVersion = mcpeVersion.replace(regReplace, "");
    if (!mcpeVersion) return mount;
    if (!mount[mcpeVersion]) mount[mcpeVersion] = {};
    if (/darwin/.test(url)) {
      if (!mount[mcpeVersion].darwin) mount[mcpeVersion].darwin = {};
      if (/aarch|arm64/.test(url)) mount[mcpeVersion].darwin.arm64 = { zip: url };
      else mount[mcpeVersion].darwin.x64 = { zip: url }
    } else if (/linux/.test(url)) {
      if (!mount[mcpeVersion].linux) mount[mcpeVersion].linux = {};
      if (/aarch|arm64/.test(url)) mount[mcpeVersion].linux.arm64 = { zip: url };
      else mount[mcpeVersion].linux.x64 = { zip: url }
    } else {
      if (!mount[mcpeVersion].win32) mount[mcpeVersion].win32 = {};
      if (/aarch|arm64/.test(url)) mount[mcpeVersion].win32.arm64 = { zip: url };
      else mount[mcpeVersion].win32.x64 = { zip: url }
    }
    return mount;
  }, {});
  const data: bedrockSchema[] = [];
  await Promise.all(Object.keys(objURLs).map(async version => {
    let release: any;
    const versionData = objURLs[version];
    await Promise.all(keys(versionData).map(platform => keys(versionData[platform]).map(async arch => {
      const fileUrl = new URL(versionData[platform][arch].zip);
      const tmpFile = versionData[platform][arch].zip = path.join(tmpdir(), `${platform}_${arch}_` + path.basename(fileUrl.pathname));
      const folderPath = tmpFile.slice(0, -(path.extname(tmpFile).length));
      const tgzPath = versionData[platform][arch].tgz = folderPath + ".tgz";
      await streamConsumer.pipeline(await http.streamRequest(fileUrl), createWriteStream(tmpFile));
      await new Promise<void>((done, reject) => (new AdmZip(tmpFile)).extractAllToAsync(folderPath, true, true, err => err ? reject(err) : done()));
      await tar.create({
        gzip: true,
        file: tgzPath,
        cwd: folderPath,
      }, await fs.readdir(folderPath));
      await fs.rm(folderPath, { recursive: true, force: true });
      release = ((/preview/).test(fileUrl.toString())) ? "preview" : "oficial";
    })).flat(2));
    const ff = keys(versionData).map(plt => keys(versionData[plt]).map(arch => versionData[plt][arch])).flat(3).at(0).zip;
    const zip = new AdmZip(ff);
    const bedrockInfo = zip.getEntries().find(file => file.name.startsWith("bedrock_server"));
    data.push({
      version: version,
      date: bedrockInfo.header.time,
      release,
      url: versionData,
    });
  }));

  return data.sort((b, a) => compareVersions(a.version, b.version));
}