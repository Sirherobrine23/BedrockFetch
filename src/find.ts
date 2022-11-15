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
  const minecraftUrls = (await httpRequest.urls({url: "https://www.minecraft.net/en-us/download/server/bedrock"})).filter(Link => /bin-.*\.zip/.test(Link));
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
  const anyZip = objURLs.win32?.x64||objURLs.linux?.x64;
  if (!anyZip) throw new Error("cannot get url");
  const [, mcpeVersion] = anyZip.match(/\/[a-zA-Z-_]+([0-9\.]+).zip$/)||[];
  const zip = await httpRequestLarge.zipDownload(anyZip);
  const mcpeDate = await new Promise<Date>(async resolve => {
    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith("bedrock_server")) return resolve(entry.header.time);
    };
    return resolve(new Date());
  });
  if (!mcpeVersion) throw new Error("No version found");
  return {
    version: mcpeVersion,
    date: mcpeDate,
    url: objURLs
  };
}

find().then(console.log)