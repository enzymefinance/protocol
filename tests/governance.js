import Api from "@parity/api";

const addressBook = require("../address-book.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../deployment/environment.config.js");
const fs = require("fs");
const rp = require("request-promise");

// TODO: should we have a separate token config for development network? much of the information is identical
const tokenInfo = require("../deployment/token.info.js").kovan;

const environment = "development";
const apiPath = "https://min-api.cryptocompare.com/data/price";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

describe("Version", () => {
  let accounts;
  let deployer;
  let manager;
  let investor;
  let worker
  let opts;
  let governance;
  let version;

  const addresses = addressBook[environment];

  beforeAll(async () => {
    accounts = await api.eth.accounts();
    deployer = accounts[0];
    manager = accounts[1];
    investor = accounts[2];
    worker = accounts[3];
    opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };

    // retrieve deployed contracts
    governance = await api.newContract(
      JSON.parse(fs.readFileSync("out/system/Governance.abi")),
      addresses.Governance,
    );

    version = await api.newContract(
      JSON.parse(fs.readFileSync("out/version/Version.abi")),
      addresses.Version,
    );
  });

  it("Version is already active", async () => {
    const versionShutDown = await version.instance.isShutDown.call({}, []);

    expect(versionShutDown).toEqual(false);
  });
  it("Governance can shut down Version", async () => {
    await governance.instance.proposeShutdown.postTransaction(opts, [0]);
    await governance.instance.approveShutdown.postTransaction(opts, [0]);
    await governance.instance.triggerShutdown.postTransaction(opts, [0]);
    const versionShutDown = await version.instance.isShutDown.call({}, []);

    expect(versionShutDown).toEqual(true);
  });
});
