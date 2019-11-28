const fs = require('fs');

const deployIn = process.env.DEPLOY_CONF;

module.exports = JSON.parse(fs.readFileSync(deployIn, 'utf8'));
