
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const appData = process.env.APPDATA;
const rlDir = path.join(appData, "RealityLauncher");
const instancesDir = path.join(rlDir, "instances");

console.log(`Checking: ${instancesDir}`);

try {
    const nativePath = path.join(process.cwd(), "native", "index.cjs");
    console.log("Loading native module from:", nativePath);
    const native = require(nativePath);

    console.log("Calling native.listInstances...");
    native.listInstances(instancesDir, 0, 100)
        .then(instances => {
            console.log("Native returned count:", instances.length);
            console.log("Instances:", JSON.stringify(instances.map(i => i.id), null, 2));
        })
        .catch(err => {
            console.error("Native error:", err);
        });

} catch (e) {
    console.error("Error:", e);
}
