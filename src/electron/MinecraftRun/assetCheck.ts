import path from "path";
import { readJsonFileSafe, fileExists, yieldToEventLoop } from "./fsUtils.js";

const RESOURCES_URL = "https://resources.download.minecraft.net";

interface AssetIndexData {
  objects?: Record<string, { hash: string; size: number }>;
}

export interface DownloadItem {
  url: string;
  path: string;
  sha1?: string;
  size?: number;
}

export async function getMissingAssetDownloadsFromIndex(
  assetIndexPath: string,
  assetsDir: string,
): Promise<DownloadItem[]> {
  const index = readJsonFileSafe<AssetIndexData>(assetIndexPath);
  if (!index?.objects) {
    throw new Error(`Invalid asset index: ${assetIndexPath}`);
  }

  const downloads: DownloadItem[] = [];
  const objects = Object.values(index.objects);
  let inspected = 0;
  for (const obj of objects) {
    inspected += 1;
    if (inspected % 300 === 0) {
      await yieldToEventLoop();
    }

    if (!obj?.hash || obj.hash.length < 2) continue;
    const hashPrefix = obj.hash.slice(0, 2);
    const destPath = path.join(assetsDir, "objects", hashPrefix, obj.hash);
    if (await fileExists(destPath)) continue;

    downloads.push({
      url: `${RESOURCES_URL}/${hashPrefix}/${obj.hash}`,
      path: destPath,
      sha1: obj.hash,
      size: obj.size,
    });
  }
  return downloads;
}
