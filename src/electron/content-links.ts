import * as path from "node:path";
import * as fs from "fs-extra";

export type InstalledContentType = "mod" | "shader" | "resourcepack" | "datapack";

export interface InstalledContentLink {
  source: "modrinth" | "curseforge";
  projectId: string;
  versionId?: string;
  iconUrl?: string | null;
}

type InstalledContentLinks = Partial<
  Record<InstalledContentType, Record<string, InstalledContentLink>>
>;

const INSTALLED_CONTENT_LINKS_FILE = ".reality-content-links.json";

function getInstalledContentLinksPath(gameDirectory: string): string {
  return path.join(gameDirectory, INSTALLED_CONTENT_LINKS_FILE);
}

export async function readInstalledContentLinks(
  gameDirectory: string,
): Promise<InstalledContentLinks> {
  const filePath = getInstalledContentLinksPath(gameDirectory);
  try {
    if (!(await fs.pathExists(filePath))) {
      return {};
    }

    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeInstalledContentLinks(
  gameDirectory: string,
  links: InstalledContentLinks,
): Promise<void> {
  const filePath = getInstalledContentLinksPath(gameDirectory);
  await fs.promises.writeFile(filePath, JSON.stringify(links, null, 2), "utf8");
}

export async function getInstalledContentLink(
  gameDirectory: string,
  contentType: InstalledContentType,
  filename: string,
): Promise<InstalledContentLink | null> {
  const links = await readInstalledContentLinks(gameDirectory);
  return links[contentType]?.[filename] || null;
}

export async function saveInstalledContentLink(
  gameDirectory: string,
  contentType: InstalledContentType,
  filename: string,
  link: InstalledContentLink,
): Promise<void> {
  const links = await readInstalledContentLinks(gameDirectory);
  const contentLinks = { ...(links[contentType] || {}) };
  contentLinks[filename] = link;
  links[contentType] = contentLinks;
  await writeInstalledContentLinks(gameDirectory, links);
}

export async function renameInstalledContentLink(
  gameDirectory: string,
  contentType: InstalledContentType,
  oldFilename: string,
  newFilename: string,
): Promise<void> {
  if (oldFilename === newFilename) return;

  const links = await readInstalledContentLinks(gameDirectory);
  const contentLinks = { ...(links[contentType] || {}) };
  const existing = contentLinks[oldFilename];
  if (!existing) return;

  delete contentLinks[oldFilename];
  contentLinks[newFilename] = existing;
  links[contentType] = contentLinks;
  await writeInstalledContentLinks(gameDirectory, links);
}

export async function deleteInstalledContentLink(
  gameDirectory: string,
  contentType: InstalledContentType,
  filename: string,
): Promise<void> {
  const links = await readInstalledContentLinks(gameDirectory);
  const contentLinks = { ...(links[contentType] || {}) };
  if (!contentLinks[filename]) return;

  delete contentLinks[filename];
  links[contentType] = contentLinks;
  await writeInstalledContentLinks(gameDirectory, links);
}
