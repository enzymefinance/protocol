const fs = require('fs');

const deployIn = process.env.CONF;

module.exports = JSON.parse(fs.readFileSync(deployIn, 'utf8'));
