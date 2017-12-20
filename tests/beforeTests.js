import Api from "@parity/api";

const testAccounts = require("../utils/chain/testAccounts.json");
const environmentConfig = require("../utils/config/environment.js");

const config = environmentConfig.development;
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

async function main() {
  testAccounts.forEach(async (account) => {
    await api.parity.newAccountFromPhrase(account, "password");
  });
  console.log("Done creating accounts");
  process.exit()
}

main();
