const https = require('https');
const fs = require('fs');

https.get('https://api.modrinth.com/v2/project/50dn9Sha', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const json = JSON.parse(data);
    fs.writeFileSync('mod_fresh_animations.md', json.body);
    console.log('Saved mod_fresh_animations.md');
  });
});
