import Api from "@parity/api";

const testAccounts = require("../utils/chain/testAccounts.json");
const environmentConfig = require("../utils/config/environmentConfig.js");

const config = environmentConfig.development;
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);
const genesisAccount = "0x00248D782B4c27b5C6F42FEB3f36918C24b211A5";

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const numAccounts = testAccounts.length;
  for (let i = 0; i < numAccounts; i += 1) {
    const newAccount = await api.parity.newAccountFromPhrase(testAccounts[i], "password");
    await timeout(2000);
    await api.personal.sendTransaction({
      from: genesisAccount,
      to: newAccount,
      value: 10 ** 30,
    }, "password");
  }
  process.exit()
}

main();
