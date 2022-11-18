import { httpRequest, httpRequestLarge } from "@the-bds-maneger/core-utils";

export type bedrockSchema = {
  version: string,
  date: Date,
  release?: "stable"|"preview",
  url: {
    [platform in NodeJS.Platform]?: {
      [arch in NodeJS.Architecture]?: string
    }
  }
};

export async function find() {
  const minecraftUrls = (await httpRequest.urls("https://www.minecraft.net/en-us/download/server/bedrock")).filter(Link => /bin-.*\.zip/.test(Link));
  const objURLs = minecraftUrls.reduce((mount, url) => {
    // get version
    let mcpeVersion = url;
    const regReplace = /((^http[s]:\/\/[a-z\.]+\/bin-[a-zA-Z0-9\-]+\/)|(\.zip$)|([a-zA-Z\-]+))/;
    while (regReplace.test(mcpeVersion)) mcpeVersion = mcpeVersion.replace(regReplace, "");
    if (!mcpeVersion) return mount;
    if (!mount[mcpeVersion]) mount[mcpeVersion] = {};
    if (/darwin/.test(url)) {
      if (!mount[mcpeVersion].darwin) mount[mcpeVersion].darwin = {};
      if (/aarch|arm64/.test(url)) mount[mcpeVersion].darwin.arm64 = url;
      else mount[mcpeVersion].darwin.x64 = url
    } else if (/linux/.test(url)) {
      if (!mount[mcpeVersion].linux) mount[mcpeVersion].linux = {};
      if (/aarch|arm64/.test(url)) mount[mcpeVersion].linux.arm64 = url;
      else mount[mcpeVersion].linux.x64 = url
    } else {
      if (!mount[mcpeVersion].win32) mount[mcpeVersion].win32 = {};
      if (/aarch|arm64/.test(url)) mount[mcpeVersion].win32.arm64 = url;
      else mount[mcpeVersion].win32.x64 = url
    }
    return mount;
  }, {} as {version: bedrockSchema["url"]});
  const data: bedrockSchema[] = [];
  for (const version of Object.keys(objURLs)) {
    const versionData = objURLs[version];
    const fistUrl = versionData[Object.keys(versionData).at(0)][Object.keys(versionData[Object.keys(versionData).at(0)]).at(0)];
    data.push({
      version: version,
      date: (((await httpRequestLarge.zipDownload(fistUrl)).getEntries()).find(file => file.entryName.startsWith("bedrock_server")))?.header?.time||new Date(),
      release: ((/preview/).test(fistUrl))?"preview":"stable",
      url: versionData,
    });
  }
  return data;
}