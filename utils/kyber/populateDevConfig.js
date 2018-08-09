const fs = require("fs");

const addressBookFile = "./addressBook.json"
const devchainConfigFile = "./utils/kyber/devchain-reserve.json";

async function populateDevConfig() {
  const a = JSON.parse(fs.readFileSync(devchainConfigFile));
  const b = JSON.parse(fs.readFileSync(addressBookFile));
  for (const i in a.tokens) {
      a.tokens[i].address = b.development[i];
  }
  fs.writeFileSync(devchainConfigFile, JSON.stringify(a, null, 4));
}

export default populateDevConfig;
