
const https = require('https');

const slug = "fabulously-optimized";
const url = `https://api.modrinth.com/v2/project/${slug}`;

https.get(url, { headers: { 'User-Agent': 'TestScript/1.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("Gallery items:", json.gallery ? json.gallery.length : 0);
            if (json.gallery && json.gallery.length > 0) {
                console.log("First gallery item:", json.gallery[0]);
            } else {
                console.log("No gallery items found.");
            }
        } catch (e) {
            console.error("JSON parse error", e);
        }
    });
}).on('error', err => console.error("Request error", err));
