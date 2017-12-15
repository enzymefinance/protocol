import test from 'ava';
import Api from "@parity/api";

const addressBook = require("../../addressBook.json");
const environmentConfig = require("../../utils/config/environment.js");
const fs = require("fs");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

let accounts;
let deployer;
let opts;
let governance;
let version;

const addresses = addressBook[environment];

test.before(async () => {
  accounts = await api.eth.accounts();
  deployer = accounts[0];
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

test('Version is already active', async t => {
  const versionShutDown = await version.instance.isShutDown.call({}, []);
  t.falsy(versionShutDown);
});

test('Governance can shut down Version', async t => {
  await governance.instance.proposeShutdown.postTransaction(opts, [0]);
  await governance.instance.approveShutdown.postTransaction(opts, [0]);
  await governance.instance.triggerShutdown.postTransaction(opts, [0]);
  const versionShutDown = await version.instance.isShutDown.call({}, []);
  console.log(versionShutDown)
  t.truthy(versionShutDown);
});
