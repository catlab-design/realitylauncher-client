
import path from 'path';
import fs from 'fs';
import os from 'os';

const appData = process.env.APPDATA;
const rlDir = path.join(appData, "RealityLauncher");
const instancesDir = path.join(rlDir, "instances");

console.log(`Checking: ${instancesDir}`);

try {
    const parentStats = fs.lstatSync(rlDir);
    console.log(`Parent (RealityLauncher) exists. isDirectory: ${parentStats.isDirectory()}`);

    // List parent content clearly
    const parentContent = fs.readdirSync(rlDir);
    console.log("Parent Content:", parentContent.join(", "));

    const hasInstances = parentContent.includes("instances");
    console.log(`'instances' in parent content? ${hasInstances}`);

    if (hasInstances) {
        try {
            const stats = fs.lstatSync(instancesDir);
            console.log(`Instances Stats:`);
            console.log(` - isDirectory: ${stats.isDirectory()}`);
            console.log(` - isSymbolicLink: ${stats.isSymbolicLink()}`);
            console.log(` - size: ${stats.size}`);

            try {
                fs.accessSync(instancesDir, fs.constants.R_OK);
                console.log(` - Readable: YES`);
            } catch (e) {
                console.log(` - Readable: NO (${e.code})`);
            }

            // Try to read it
            const children = fs.readdirSync(instancesDir);
            console.log(`Children count: ${children.length}`);
            console.log(`Children: ${children.slice(0, 5).join(", ")} ...`);
        } catch (e) {
            console.error(`Error lstat/reading instances:`, e);
        }
    } else {
        console.error("instances folder NOT found in parent listing!");
    }

} catch (e) {
    console.error("Error accessing parent:", e);
}
