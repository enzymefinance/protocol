import Api from "@parity/api";

const testAccounts = require("../utils/chain/testAccounts.json");
const environmentConfig = require("../utils/config/environment.js");

const config = environmentConfig.development;
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

async function main() {
  const numAccounts = testAccounts.length;
  for (let i = 0; i < numAccounts; i += 1) {
    await api.parity.newAccountFromPhrase(testAccounts[i], "password");
  }
  process.exit()
}

main();
