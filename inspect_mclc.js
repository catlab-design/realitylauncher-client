const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, 'node_modules', 'minecraft-java-core', 'build', 'Launch.js');
try {
    const content = fs.readFileSync(target, 'utf8');
    console.log(content);
} catch (e) {
    console.error(e);
}
