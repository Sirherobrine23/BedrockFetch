import { httpRequest, httpRequestLarge } from "@the-bds-maneger/core-utils";

export type bedrockSchema = {
  version: string,
  date: Date,
  url: {
    [platform in NodeJS.Platform]?: {
      [arch in NodeJS.Architecture]?: string
    }
  }
};

export async function find(): Promise<bedrockSchema|void> {
  const minecraftUrls = (await httpRequest.urls({
    url: "https://www.minecraft.net/en-us/download/server/bedrock",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
    }
  })).filter(Link => /bin-.*\.zip/.test(Link));
  const objURLs = minecraftUrls.reduce((mount, url) => {
    if (/darwin/.test(url)) {
      if (!mount.darwin) mount.darwin = {};
      if (/aarch|arm64/.test(url)) mount.darwin.arm64 = url;
      else mount.darwin.x64 = url
    } else if (/linux/.test(url)) {
      if (!mount.linux) mount.linux = {};
      if (/aarch|arm64/.test(url)) mount.linux.arm64 = url;
      else mount.linux.x64 = url
    } else {
      if (!mount.win32) mount.win32 = {};
      if (/aarch|arm64/.test(url)) mount.win32.arm64 = url;
      else mount.win32.x64 = url
    }
    return mount;
  }, {} as bedrockSchema["url"]);

  // Object file
  const anyZip = objURLs.win32?.x64||objURLs.linux?.x64;
  if (!anyZip) throw new Error("cannot get url");

  // get version
  let mcpeVersion = anyZip;
  const regReplace = /((^http[s]:\/\/[a-z\.]+\/bin-[a-zA-Z0-9]+\/)|(\.zip$)|([a-zA-Z\-]+))/;
  while (regReplace.test(mcpeVersion)) mcpeVersion = mcpeVersion.replace(regReplace, "");
  if (!mcpeVersion) throw new Error("No version found");

  return {
    version: mcpeVersion,
    date: (((await httpRequestLarge.zipDownload(anyZip)).getEntries()).find(file => file.entryName.startsWith("bedrock_server")))?.header?.time||new Date(),
    url: objURLs
  };
}