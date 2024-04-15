const fs = require('fs');

if (fs.existsSync('./csv')) fs.rmSync('./csv', { recursive: true });
if (fs.existsSync('./zips')) fs.rmSync('./zips', { recursive: true });
//if (fs.existsSync('./node_modules')) fs.rmSync('./node_modules', { recursive: true });