const fs = require('fs');

const deployIn = process.env.CONF; // || './deploy_in.json';

module.exports = JSON.parse(fs.readFileSync(deployIn, 'utf8'));
