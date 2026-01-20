
import path from 'path';
import fs from 'fs';
import os from 'os';

const appData = process.env.APPDATA;
console.log("Checking AppData:", appData);

if (fs.existsSync(appData)) {
    const entries = fs.readdirSync(appData);
    console.log("Entries in AppData:");
    entries.forEach(e => {
        if (e.toLowerCase().includes("reality")) {
            console.log(`FOUND: ${e}`);
            // Check inside
            const inner = path.join(appData, e);
            if (fs.statSync(inner).isDirectory()) {
                console.log(`  Callback: contents of ${e}`);
                fs.readdirSync(inner).forEach(sub => console.log(`  - ${sub}`));
            }
        }
    });
} else {
    console.error("AppData path does not exist!");
}
