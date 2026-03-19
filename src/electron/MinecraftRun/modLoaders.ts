import fs from "fs";
import path from "path";

import { getMinecraftDir } from "../config.js";
import { downloadFileAtomic } from "../modrinth.js";

type ResolveJavaPath = (
  customJavaPath: string | undefined,
  configJavaPath: string | undefined,
  native: any,
  mcVersion?: string,
) => Promise<string>;

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function ensureLibrariesDownloaded(
  versionJsonStr: string,
  minecraftDir: string,
): Promise<void> {
  const version = JSON.parse(versionJsonStr);
  const librariesDir = path.join(minecraftDir, "libraries");
  const libs: any[] = version.libraries || [];
  const missingLibraries: Array<{
    relPath: string;
    destPath: string;
    url: string;
    sha1?: string;
  }> = [];

  let scannedLibs = 0;
  for (const lib of libs) {
    scannedLibs += 1;
    if (scannedLibs % 120 === 0) {
      await yieldToEventLoop();
    }
    try {
      const artifact = lib.downloads?.artifact;
      let relPath: string | undefined = artifact?.path;

      if (!relPath) {
        const parts = (lib.name || "").split(":");
        if (parts.length >= 3) {
          const [group, name, ver, classifier] = parts;
          const groupPath = group.replace(/\./g, "/");
          const file = classifier
            ? `${name}-${ver}-${classifier}.jar`
            : `${name}-${ver}.jar`;
          relPath = `${groupPath}/${name}/${ver}/${file}`;
        }
      }

      if (!relPath) continue;

      const destPath = path.join(librariesDir, relPath);
      if (fs.existsSync(destPath)) continue;

      let baseUrl = artifact?.url || lib.url;
      if (!baseUrl) {
        const group = (lib.name || "").split(":")[0] || "";
        if (group.startsWith("net.minecraftforge")) {
          baseUrl = "https://maven.minecraftforge.net";
        } else if (group.startsWith("net.neoforged")) {
          baseUrl = "https://maven.neoforged.net/releases";
        } else {
          // Default Minecraft libs CDN
          baseUrl = "https://libraries.minecraft.net";
        }
      }

      const url = baseUrl.endsWith("/")
        ? `${baseUrl}${relPath}`
        : `${baseUrl}/${relPath}`;
      const sha1 = artifact?.sha1;
      missingLibraries.push({ relPath, destPath, url, sha1 });
    } catch (e) {
      console.warn("[ForgeFix] Failed to ensure library", e);
    }
  }

  if (missingLibraries.length === 0) {
    return;
  }

  const concurrency = Math.min(8, missingLibraries.length);
  const queue = [...missingLibraries];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;

      try {
        await fs.promises.mkdir(path.dirname(item.destPath), {
          recursive: true,
        });
        await downloadFileAtomic(
          item.url,
          item.destPath,
          item.sha1 ? { sha1: item.sha1 } : undefined,
        );
        console.log(`[ForgeFix] Downloaded missing library: ${item.relPath}`);
      } catch (e) {
        console.warn("[ForgeFix] Failed to ensure library", e);
      }
    }
  });

  await Promise.all(workers);
}

/**
 * Merge libraries from child and parent, prioritizing child versions.
 * Deduplicates based on group:artifact (and classifier if present).
 */
export function mergeLibraries(childLibs: any[], parentLibs: any[]): any[] {
  const libMap = new Map<string, any>();

  const getLibKey = (lib: any) => {
    // name format: group:artifact:version[:classifier]
    const parts = (lib.name || "").split(":");
    if (parts.length < 2) return lib.name; // Fallback

    const group = parts[0];
    const artifact = parts[1];
    const classifier = parts[3];
    // Key includes classifier to allow natives + main jar
    return classifier
      ? `${group}:${artifact}:${classifier}`
      : `${group}:${artifact}`;
  };

  // 1. Add child libs (priority)
  for (const lib of childLibs) {
    const key = getLibKey(lib);
    // If child defines duplicate internally, valid logic would be keep first or last?
    // Usually assume unique in single profile.
    libMap.set(key, lib);
  }

  // 2. Add parent libs if not overridden
  for (const lib of parentLibs) {
    const key = getLibKey(lib);
    if (!libMap.has(key)) {
      libMap.set(key, lib);
    } else {
      // Optional: Log conflict resolution
      // const childLib = libMap.get(key);
      // console.log(`[RustLauncher] Resolving library conflict: ${childLib.name} (Child) overrides ${lib.name} (Parent)`);
    }
  }

  return Array.from(libMap.values());
}

export async function applyModLoader(
  versionJson: string,
  mcVersion: string,
  loader: { type: string; build?: string },
  gameDir: string,
  native: any,
  resolveJavaPath: ResolveJavaPath,
): Promise<string> {
  const loaderType = loader.type.toLowerCase();

  if (loaderType === "fabric") {
    // Use native Rust Fabric installer
    console.log(`[Fabric] Using native Rust installer...`);
    const minecraftDir = getMinecraftDir();

    try {
      const loaderVersion =
        loader.build === "latest" ? undefined : loader.build;
      const result = await native.installFabric(
        mcVersion,
        loaderVersion,
        minecraftDir,
      );

      console.log(`[Fabric] Installed: ${result.versionId}`);

      // Read the generated version JSON
      const fabricVersionJson = fs.readFileSync(
        result.versionJsonPath,
        "utf-8",
      );
      const fabricProfile = JSON.parse(fabricVersionJson);

      // Merge with vanilla - IMPORTANT: must preserve loader arguments (JVM/game)
      // fabricProfile.arguments contains critical args like -DFabricMcEmu=net.minecraft.client.main.Main
      const vanilla = JSON.parse(versionJson);
      const mergedLibraries = mergeLibraries(
        fabricProfile.libraries || [],
        vanilla.libraries || [],
      );
      return JSON.stringify({
        ...vanilla,
        mainClass: fabricProfile.mainClass,
        // Keep loader libraries first and drop conflicting duplicates (e.g. ASM 9.9 vs 9.6)
        libraries: mergedLibraries,
        // Merge arguments: loader args first (JVM), then vanilla args
        arguments: {
          game: [
            ...(fabricProfile.arguments?.game || []),
            ...(vanilla.arguments?.game || []),
          ],
          jvm: [
            ...(fabricProfile.arguments?.jvm || []),
            ...(vanilla.arguments?.jvm || []),
          ],
        },
      });
    } catch (e: any) {
      console.error(`[Fabric] Native install failed:`, e);
      throw new Error(`Fabric install failed: ${e.message}`);
    }
  }

  if (loaderType === "forge" || loaderType === "neoforge") {
    const minecraftDir = getMinecraftDir();
    const librariesDir = path.join(minecraftDir, "libraries");
    const rustLoaderType = loaderType === "neoforge" ? "NeoForge" : "Forge";
    console.log(`[${loaderType}] Using native Rust installer...`);

    let vjson: string;

    try {
      const versionJsonPath = await native.installForge(
        mcVersion,
        rustLoaderType,
        loader.build,
        minecraftDir,
        undefined,
      );
      vjson = fs.readFileSync(versionJsonPath, "utf-8");
      await ensureLibrariesDownloaded(vjson, minecraftDir);
    } catch (e: any) {
      console.error(`Native Forge install failed:`, e);
      throw new Error(`Native Forge install failed: ${e.message}`);
    }

    // Parse version to extract forge version and MCP version
    const versionData = JSON.parse(vjson);
    const forgeVersionId = versionData.id || "";
    // Extract forge version like "47.4.0" from "1.20.1-forge-47.4.0" or "1.20.1-47.4.0"
    let forgeVersionMatch = forgeVersionId.match(/forge-(\d+\.\d+\.\d+)/);
    if (!forgeVersionMatch && loader.build) {
      // Try to extract from loader.build like "1.20.1-47.4.0" or just "47.4.0"
      const buildMatch = loader.build.match(/(\d+\.\d+\.\d+)$/);
      if (buildMatch) {
        forgeVersionMatch = buildMatch;
      }
    }
    const forgeVersion = forgeVersionMatch ? forgeVersionMatch[1] : "latest";
    console.log(
      `[${loaderType}] Extracted forge version: ${forgeVersion} from ID: ${forgeVersionId}, build: ${loader.build}`,
    );

    // Extract MCP/NeoForm version from arguments
    // Forge uses --fml.mcpVersion, NeoForge 1.21+ uses --fml.neoFormVersion
    let mcpVersion = "";
    const allGameArgs = versionData.arguments?.game || [];
    for (let i = 0; i < allGameArgs.length; i++) {
      const a = allGameArgs[i];
      if (typeof a === "string") {
        if (
          (a === "--fml.neoFormVersion" || a === "--fml.mcpVersion") &&
          typeof allGameArgs[i + 1] === "string"
        ) {
          mcpVersion = allGameArgs[i + 1];
          console.log(
            `[${loaderType}] Found MCP/NeoForm version: ${mcpVersion} from arg: ${a}`,
          );
          break;
        }
      }
    }
    if (!mcpVersion) {
      // Fallback default for Forge 1.20.1
      mcpVersion = loaderType === "neoforge" ? "" : "20230612.114412";
      console.log(
        `[${loaderType}] Using fallback MCP version: ${mcpVersion || "(none)"}`,
      );
    }

    // Check for processor-generated files directly by known paths
    // These files are NOT downloadable - they MUST be generated by Forge/NeoForge installer
    const processorFiles: string[] = [];
    if (loaderType === "neoforge") {
      // NeoForge client jar: net/neoforged/neoforge/VERSION/neoforge-VERSION-client.jar
      processorFiles.push(
        path.join(
          librariesDir,
          "net",
          "neoforged",
          "neoforge",
          forgeVersion,
          `neoforge-${forgeVersion}-client.jar`,
        ),
      );
      if (mcpVersion) {
        // NeoForm processor outputs (NeoForge 1.21+ uses "slim" instead of "srg")
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-slim.jar`,
          ),
        );
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-extra.jar`,
          ),
        );
      }
    } else {
      // Traditional Forge: net/minecraftforge/forge/MC-FORGE/forge-MC-FORGE-client.jar
      processorFiles.push(
        path.join(
          librariesDir,
          "net",
          "minecraftforge",
          "forge",
          `${mcVersion}-${forgeVersion}`,
          `forge-${mcVersion}-${forgeVersion}-client.jar`,
        ),
      );
      if (mcpVersion) {
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-srg.jar`,
          ),
        );
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-extra.jar`,
          ),
        );
      }
    }

    const missingProcessorFiles = processorFiles.filter(
      (f) => !fs.existsSync(f),
    );
    console.log(
      `[${loaderType}] Checking processor files:`,
      processorFiles.map(
        (f) =>
          `${path.basename(f)}: ${fs.existsSync(f) ? "EXISTS" : "MISSING"}`,
      ),
    );

    if (missingProcessorFiles.length > 0) {
      console.log(
        `[${loaderType}] Missing processor-generated files:`,
        missingProcessorFiles.map((f) => path.basename(f)),
      );
      console.log(
        `[${loaderType}] Running Forge installer with Java to generate them...`,
      );

      // Create dummy launcher_profiles.json (required by Forge installer)
      const launcherProfilesPath = path.join(
        minecraftDir,
        "launcher_profiles.json",
      );
      if (!fs.existsSync(launcherProfilesPath)) {
        const dummyProfile = {
          profiles: {},
          selectedProfile: "(Default)",
          clientToken: "00000000-0000-0000-0000-000000000000",
          authenticationDatabase: {},
          launcherVersion: {
            name: "RealityLauncher",
            format: 21,
            profilesFormat: 1,
          },
        };
        fs.writeFileSync(
          launcherProfilesPath,
          JSON.stringify(dummyProfile, null, 2),
        );
        console.log(`[${loaderType}] Created dummy launcher_profiles.json`);
      }

      // Download installer JAR
      const installerUrl =
        loaderType === "neoforge"
          ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${forgeVersion}/neoforge-${forgeVersion}-installer.jar`
          : `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;

      const installerPath = path.join(
        minecraftDir,
        "temp",
        `${loaderType}-installer-${mcVersion}-${forgeVersion}.jar`,
      );
      fs.mkdirSync(path.dirname(installerPath), { recursive: true });

      if (!fs.existsSync(installerPath)) {
        console.log(`[${loaderType}] Downloading installer: ${installerUrl}`);
        await downloadFileAtomic(installerUrl, installerPath);
      }

      // Find Java path for running installer
      let javaPath: string;
      try {
        // NeoForge 1.21+ installer may need Java 21
        // Forge 1.20.x installer works best with Java 17
        const mcMinor = parseInt(mcVersion.split(".")[1] || "0");
        const mcPatch = parseInt(mcVersion.split(".")[2] || "0");
        const needsJava21 =
          loaderType === "neoforge" &&
          (mcMinor > 20 || (mcMinor === 20 && mcPatch >= 5));
        const forceVersion = needsJava21 ? "1.21" : "1.18.2";
        javaPath = await resolveJavaPath(
          undefined,
          undefined,
          native,
          forceVersion,
        );
        console.log(
          `[${loaderType}] Selected Java ${needsJava21 ? "21+" : "17"} for installer: ${javaPath}`,
        );
      } catch {
        // Fallback to system Java
        javaPath = "java";
      }
      console.log(`[${loaderType}] Running installer with Java: ${javaPath}`);

      // Run Forge installer in headless mode (async to prevent UI freeze)
      try {
        if (typeof native.runForgeInstaller === "function") {
          console.log(
            `[${loaderType}] Native forge installer: "${javaPath}" -jar "${installerPath}" --installClient "${minecraftDir}"`,
          );
          const runResult = (await native.runForgeInstaller(
            javaPath,
            installerPath,
            minecraftDir,
            600000,
          )) as {
            success?: boolean;
            timeout?: boolean;
            exitCode?: number | null;
            error?: string | null;
          };

          if (!runResult?.success) {
            if (runResult?.timeout) {
              throw new Error("Installer timeout (10 minutes)");
            }
            throw new Error(
              runResult?.error ||
                `Installer exited with code ${runResult?.exitCode ?? "unknown"}`,
            );
          }
          console.log(`[${loaderType}] Installer completed successfully`);
        } else {
          const { spawn } = await import("child_process");
          console.log(
            `[${loaderType}] Install command: "${javaPath}" -jar "${installerPath}" --installClient "${minecraftDir}"`,
          );

          await new Promise<void>((resolve, reject) => {
            const installerProcess = spawn(
              javaPath,
              ["-jar", installerPath, "--installClient", minecraftDir],
              {
                cwd: minecraftDir,
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
              },
            );

            let stdout = "";
            let stderr = "";

            installerProcess.stdout?.on("data", (data: Buffer) => {
              const text = data.toString();
              stdout += text;
              const lines = text.split("\n").filter((l: string) => l.trim());
              for (const line of lines) {
                console.log(`[${loaderType}] ${line.trim()}`);
              }
            });

            installerProcess.stderr?.on("data", (data: Buffer) => {
              stderr += data.toString();
            });

            installerProcess.on("close", (code) => {
              if (code === 0) {
                console.log(`[${loaderType}] Installer completed successfully`);
                resolve();
              } else {
                console.error(
                  `[${loaderType}] Installer Process Failed with code ${code}!`,
                );
                if (stdout) console.log(`[${loaderType}] stdout:\n${stdout}`);
                if (stderr) console.error(`[${loaderType}] stderr:\n${stderr}`);
                reject(new Error(`Installer exited with code ${code}`));
              }
            });

            installerProcess.on("error", (err) => {
              console.error(`[${loaderType}] Installer spawn error:`, err);
              reject(err);
            });

            setTimeout(() => {
              installerProcess.kill();
              reject(new Error("Installer timeout (10 minutes)"));
            }, 600000);
          });
        }
      } catch (installErr: any) {
        console.error(
          `[${loaderType}] Installer process encountered an error:`,
          installErr.message,
        );

        // Check if files were created despite error (sometimes installer exits with non-zero but does the job)
        const stillMissing = processorFiles.filter((f) => !fs.existsSync(f));
        if (stillMissing.length > 0) {
          const missingNames = stillMissing
            .map((f) => path.basename(f))
            .join(", ");
          throw new Error(`
                        Forge installer failed to generate required files: ${missingNames}.
                        
                        Troubleshooting:
                        1. Try changing Java version (Java 17 recommended for 1.18-1.20)
                        2. Check internet connection
                        3. Try "Verify Files" to reset libraries
                    `);
        } else {
          console.warn(
            `[${loaderType}] Installer reported error but required files exist. Proceeding...`,
          );
        }
      }

      // Cleanup installer
      try {
        fs.unlinkSync(installerPath);
      } catch {}
    }

    return vjson;
  } /* Legacy TS Implementation:

        if (!forgeFullVersion || forgeFullVersion === "latest") {
            try {
                if (loaderType === "neoforge") {
                    // NeoForge: Fetch from maven-metadata.xml
                    const metadataUrl = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
                    const xmlText = await fetch(metadataUrl).then(r => r.text());

                    // Parse XML roughly with Regex
                    const versionMatch = xmlText.match(/<version>(.*?)<\/version>/g);
                    if (versionMatch) {
                        const versions = versionMatch.map(v => v.replace(/<\/?version>/g, ""));
                        // Filter by MC version - NeoForge uses simplified version like 20.1.x for MC 1.20.1
                        const validVersions = versions.filter(v => {
                            if (mcVersion === "1.20.1") return v.startsWith("47.1") || v.startsWith("20.1");
                            if (mcVersion === "1.21") return v.startsWith("21.");
                            if (mcVersion === "1.21.1") return v.startsWith("21.1");
                            const shortVer = mcVersion.split(".").slice(1).join(".");
                            return v.startsWith(shortVer);
                        }).reverse(); // Newest first

                        forgeFullVersion = validVersions[0];
                        console.log(`[NeoForge] Found versions for ${mcVersion}:`, validVersions.slice(0, 5));
                    }

                    if (!forgeFullVersion) {
                        console.error(`[NeoForge] No matching version found for MC ${mcVersion}`);
                    }
                } else {
                    // Forge: promotions_slim.json
                    const forgeListUrl = `https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`;
                    const forgeListRes = await fetch(forgeListUrl);
                    const forgeList = await forgeListRes.json();

                    const recommendedKey = `${mcVersion}-recommended`;
                    const latestKey = `${mcVersion}-latest`;
                    forgeFullVersion = forgeList.promos?.[recommendedKey] || forgeList.promos?.[latestKey];
                    if (forgeFullVersion) {
                        forgeFullVersion = `${mcVersion}-${forgeFullVersion}`;
                    }
                }
            } catch (e) {
                console.error(`[${loaderType}] Failed to fetch version list:`, e);
            }
        }

        if (!forgeFullVersion) {
            throw new Error(`ไม่พบ ${loaderType === "neoforge" ? "NeoForge" : "Forge"} สำหรับ Minecraft ${mcVersion}`);
        }

        console.log(`[${loaderType}] Using version: ${forgeFullVersion}`);

        // Check if Forge version JSON already exists
        const forgeVersionId = loaderType === "neoforge"
            ? `neoforge-${forgeFullVersion}`
            : `${mcVersion}-forge-${forgeFullVersion.replace(mcVersion + "-", "")}`;
        const forgeVersionJsonPath = path.join(minecraftDir, "versions", forgeVersionId, `${forgeVersionId}.json`);

        if (fs.existsSync(forgeVersionJsonPath)) {
            console.log(`[${loaderType}] Using existing version JSON: ${forgeVersionJsonPath}`);
            return fs.readFileSync(forgeVersionJsonPath, "utf-8");
        }

        // Download Forge/NeoForge installer
        const installerUrl = loaderType === "neoforge"
            ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${forgeFullVersion}/neoforge-${forgeFullVersion}-installer.jar`
            : `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeFullVersion}/forge-${forgeFullVersion}-installer.jar`;

        const installerPath = path.join(minecraftDir, "temp", `${loaderType}-installer-${forgeFullVersion}.jar`);
        fs.mkdirSync(path.dirname(installerPath), { recursive: true });

        console.log(`[${loaderType}] Downloading installer from: ${installerUrl}`);

        // Download installer using atomic downloader
        await downloadFileAtomic(installerUrl, installerPath);


        // Manual extraction (Forge installer requires GUI mode, can't run headless)
        console.log(`[${loaderType}] Extracting from installer JAR...`);


        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(installerPath);

        const installProfileEntry = zip.getEntry("install_profile.json");
        const versionJsonEntry = zip.getEntry("version.json");

        if (!installProfileEntry && !versionJsonEntry) {
            throw new Error(`ไม่พบ install profile ใน ${loaderType} installer`);
        }

        let forgeVersionJson: any;
        if (versionJsonEntry) {
            forgeVersionJson = JSON.parse(versionJsonEntry.getData().toString("utf-8"));
        } else if (installProfileEntry) {
            const installProfile = JSON.parse(installProfileEntry.getData().toString("utf-8"));
            forgeVersionJson = installProfile.versionInfo;
        }

        if (!forgeVersionJson) {
            throw new Error(`ไม่สามารถอ่าน version info จาก ${loaderType} installer`);
        }

        // Extract libraries from installer (maven/)
        const libEntries = zip.getEntries().filter(e =>
            e.entryName.startsWith("maven/") && !e.isDirectory
        );

        for (const libEntry of libEntries) {
            const targetPath = path.join(librariesDir, libEntry.entryName.replace("maven/", ""));
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            if (!fs.existsSync(targetPath)) {
                fs.writeFileSync(targetPath, libEntry.getData());
            }
        }


        // Fix for Modern Forge (1.17+): Extract data/ libraries
        // The installer contains files in data/ that need to be placed in libraries/
        // We parse install_profile.json to understand the mapping

        let installProfile: any = null;
        if (installProfileEntry) {
            installProfile = JSON.parse(installProfileEntry.getData().toString("utf-8"));
        }

        // Extract ALL data/*.jar files - we'll figure out mapping dynamically
        const dataJarEntries = zip.getEntries().filter(e =>
            e.entryName.startsWith("data/") && e.entryName.endsWith(".jar") && !e.isDirectory
        );

        console.log(`[${loaderType}] Found ${dataJarEntries.length} data JAR entries`);

        // The install_profile.json has a "data" section that maps keys to file references
        // e.g. "MAPPINGS": { "client": "[de.oceanlabs.mcp:mcp_config:1.20.1-20230612.114412@zip]" }
        // We need to extract these files to the correct library paths

        if (installProfile && installProfile.data) {
            console.log(`[${loaderType}] Processing install_profile.data keys:`, Object.keys(installProfile.data));

            for (const key of Object.keys(installProfile.data)) {
                const dataItem = installProfile.data[key];
                let clientValue = dataItem.client;

                if (!clientValue) continue;

                // If it's a reference like [xxx:yyy:zzz@ext], it's a Maven artifact
                // If it's a path like /data/client.jar, it's a local file in the installer
                if (clientValue.startsWith("/")) {
                    // Local file reference - strip leading /
                    const zipPath = clientValue.substring(1); // e.g., "data/client.jar"
                    const entry = zip.getEntry(zipPath);

                    if (entry) {
                        // For local files like /data/client.jar, we need to find which library needs it
                        // by checking version.json libraries that don't have downloads

                        // Common patterns:
                        // PATCHED -> net.minecraft:client:xxx:xxx-srg
                        // CLIENT_EXTRA -> net.minecraft:client:xxx-extra
                        // etc.

                        // For now, let's extract to a temp location and let Forge handle it
                        // OR, better: parse the forgeVersionJson.libraries to find matching entries

                        const libs = forgeVersionJson.libraries || [];
                        for (const lib of libs) {
                            // Check if this library has no download URL (meaning it should be provided by installer)
                            const hasDownload = lib.downloads?.artifact?.url || lib.url;
                            if (hasDownload) continue;

                            // Parse Maven coordinates: group:artifact:version[:classifier]
                            const parts = lib.name.split(":");
                            if (parts.length < 3) continue;

                            const group = parts[0].replace(/\./g, "/");
                            const artifact = parts[1];
                            const version = parts[2];
                            const classifier = parts[3] ? `-${parts[3]}` : "";

                            // Check if this key matches the library's classifier
                            // Common mappings:
                            // PATCHED -> srg (or just "client")
                            // CLIENT_EXTRA -> extra
                            const lowerKey = key.toLowerCase();
                            const lowerClassifier = classifier.toLowerCase();

                            let isMatch = false;
                            if (lowerKey === "patched" && (lowerClassifier.includes("srg") || artifact === "client")) isMatch = true;
                            if (lowerKey === "client_extra" && lowerClassifier.includes("extra")) isMatch = true;
                            if (lowerKey === "slim" && lowerClassifier.includes("slim")) isMatch = true;
                            if (lowerKey.includes(artifact.toLowerCase())) isMatch = true;

                            if (isMatch || (!hasDownload && lib.name.includes("client"))) {
                                const destPath = path.join(librariesDir, group, artifact, version, `${artifact}-${version}${classifier}.jar`);

                                if (!fs.existsSync(destPath)) {
                                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                                    fs.writeFileSync(destPath, entry.getData());
                                    console.log(`[${loaderType}] Extracted ${key} -> ${destPath}`);
                                }
                            }
                        }
                    }
                }
            }
        }

        // FALLBACK: Extract all data/*.jar entries that look like they should be libraries
        // This catches edge cases where the install_profile mapping is incomplete
        for (const entry of dataJarEntries) {
            const fileName = path.basename(entry.entryName);

            // Try to find a library in version.json that needs this file
            const libs = forgeVersionJson.libraries || [];
            for (const lib of libs) {
                const hasDownload = lib.downloads?.artifact?.url || lib.url;
                if (hasDownload) continue;

                // Check if library name matches file name pattern
                const parts = lib.name.split(":");
                if (parts.length < 3) continue;

                const artifact = parts[1];

                // If the data file contains the artifact name, it might be a match
                if (fileName.toLowerCase().includes(artifact.toLowerCase()) ||
                    (artifact === "client" && fileName === "client.jar")) {

                    const group = parts[0].replace(/\./g, "/");
                    const version = parts[2];
                    const classifier = parts[3] ? `-${parts[3]}` : "";
                    const destPath = path.join(librariesDir, group, artifact, version, `${artifact}-${version}${classifier}.jar`);

                    if (!fs.existsSync(destPath)) {
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        fs.writeFileSync(destPath, entry.getData());
                        console.log(`[${loaderType}] Fallback extracted ${entry.entryName} -> ${destPath}`);
                    }
                }
            }
        }

        // Save version JSON
        fs.mkdirSync(path.dirname(forgeVersionJsonPath), { recursive: true });
        fs.writeFileSync(forgeVersionJsonPath, JSON.stringify(forgeVersionJson, null, 2));

        // Cleanup installer
        try { fs.unlinkSync(installerPath); } catch { }

    */

  if (loaderType === "quilt") {
    // Use native Rust Quilt installer
    console.log(`[Quilt] Using native Rust installer...`);
    const minecraftDir = getMinecraftDir();

    try {
      const loaderVersion =
        loader.build === "latest" ? undefined : loader.build;
      const result = await native.installQuilt(
        mcVersion,
        loaderVersion,
        minecraftDir,
      );

      console.log(`[Quilt] Installed: ${result.versionId}`);

      // Read the generated version JSON
      const quiltVersionJson = fs.readFileSync(result.versionJsonPath, "utf-8");
      const quiltProfile = JSON.parse(quiltVersionJson);

      // Merge with vanilla - IMPORTANT: must preserve loader arguments (JVM/game)
      // quiltProfile.arguments contains critical args like -DQuiltMcEmu=net.minecraft.client.main.Main
      const vanilla = JSON.parse(versionJson);
      const mergedLibraries = mergeLibraries(
        quiltProfile.libraries || [],
        vanilla.libraries || [],
      );
      return JSON.stringify({
        ...vanilla,
        mainClass: quiltProfile.mainClass,
        // Keep loader libraries first and drop conflicting duplicates
        libraries: mergedLibraries,
        // Merge arguments: loader args first (JVM), then vanilla args
        arguments: {
          game: [
            ...(quiltProfile.arguments?.game || []),
            ...(vanilla.arguments?.game || []),
          ],
          jvm: [
            ...(quiltProfile.arguments?.jvm || []),
            ...(vanilla.arguments?.jvm || []),
          ],
        },
      });
    } catch (e: any) {
      console.error(`[Quilt] Native install failed:`, e);
      throw new Error(`Quilt install failed: ${e.message}`);
    }
  }

  // Fallback: Vanilla
  console.warn(
    `[Loader] Unknown loader type: ${loaderType}, falling back to vanilla`,
  );
  return versionJson;
}
