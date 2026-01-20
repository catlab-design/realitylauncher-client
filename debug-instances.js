
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function getAppDataDir() {
    const platform = process.platform;
    if (platform === "win32") {
        return path.join(process.env.APPDATA, "RealityLauncher");
    } else {
        return path.join(os.homedir(), ".realitylauncher");
    }
}

const appData = getAppDataDir();
const instancesDir = path.join(appData, "instances");

console.log("=== Debug Info ===");
console.log("AppData:", appData);
console.log("Instances Dir:", instancesDir);

if (!fs.existsSync(instancesDir)) {
    console.error("ERROR: Instances directory does not exist at expected path!");
} else {
    console.log("Instances directory exists.");
    try {
        const entries = fs.readdirSync(instancesDir, { withFileTypes: true });
        console.log(`Found ${entries.length} entries in instances dir.`);

        entries.forEach(entry => {
            console.log(` - ${entry.name} [${entry.isDirectory() ? 'DIR' : 'FILE'}]`);
            if (entry.isDirectory()) {
                const metaPath = path.join(instancesDir, entry.name, "instance.json");
                if (fs.existsSync(metaPath)) {
                    console.log(`   -> instance.json FOUND`);
                    try {
                        const content = fs.readFileSync(metaPath, 'utf8');
                        console.log(`   -> Content start: ${content.substring(0, 50)}...`);
                    } catch (e) {
                        console.log(`   -> Error reading file: ${e.message}`);
                    }
                } else {
                    console.log(`   -> instance.json MISSING`);
                }
            }
        });
    } catch (e) {
        console.error("Error reading instances dir:", e);
    }
}

// Check for old location just in case
const oldLoc = path.join(process.env.APPDATA, ".minecraft", "instances");
if (fs.existsSync(oldLoc)) {
    console.log("Found .minecraft/instances:", oldLoc);
    console.log("Entries:", fs.readdirSync(oldLoc));
} else {
    console.log(".minecraft/instances does not exist.");
}
