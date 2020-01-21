const fs = require('fs');

let deploySrcPath;
if (process.env.REDEPLOY_ALL === "false") {
  deploySrcPath = process.env.DEPLOY_OUT;
}
else {
  deploySrcPath = process.env.DEPLOY_IN;
}

module.exports = JSON.parse(fs.readFileSync(deploySrcPath, 'utf8'));
