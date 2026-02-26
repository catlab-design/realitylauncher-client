const https = require('https');

const url = "https://api.reality.catlabdesign.space/curseforge/search?query=Ender's%20Journey&projectType=modpack&pageSize=1";

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
            if (json.data && json.data.length > 0) {
                console.log('ID:', json.data[0].id);
                console.log('Name:', json.data[0].name);
                console.log('ThumbsUpCount:', json.data[0].thumbsUpCount);
            }
        } catch (e) {
            console.error(e.message);
        }
    });
}).on('error', (err) => {
    console.error("Error: " + err.message);
});
