
const https = require('https');

https.get('https://api.modrinth.com/v2/search?query=sodium&limit=1', {
    headers: { 'User-Agent': 'TestScript/1.0' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.hits && json.hits.length > 0) {
                console.log(JSON.stringify(json.hits[0], null, 2));
            } else {
                console.log("No hits found");
            }
        } catch (e) {
            console.error(e);
        }
    });
}).on('error', err => console.error(err));
