import Api from "@parity/api";

const testAccounts = require("../utils/chain/testAccounts.json");
const environmentConfig = require("../utils/config/environment.js");

const config = environmentConfig.development;
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

async function main() {
  await Promise.all(testAccounts.map(async (account, index) => {
    await api.parity.newAccountFromPhrase(account, "password");
    console.log(`Created account ${index+1} of ${testAccounts.length}`);
  }));
  process.exit(0);
}

main();
