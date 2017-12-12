import test from "ava";
import Api from "@parity/api";

const addressBook = require("../../../addressBook.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../../../utils/config/environment.js");
const fs = require("fs");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

let accounts;
let deployer;
let manager;
let worker;
let investor;
let opts;
let version;

const addresses = addressBook[environment];

test.before(async t => {
  accounts = await api.eth.accounts();
  deployer = accounts[0];
  manager = accounts[1];
  investor = accounts[2];
  worker = accounts[3];
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };

  // retrieve deployed contracts
  version = await api.newContract(
    JSON.parse(fs.readFileSync("out/version/Version.abi")),
    addresses.Version,
  );
});

test('Can setup and new fund', async t => {
  const preLastFundId = await version.instance.getLastFundId.call({}, []);
  const hash =
    "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      'Super Fund', // name
      addresses.MlnToken, // reference asset
      0,
      0,
      addresses.NoCompliance,
      addresses.RMMakeOrders,
      addresses.PriceFeed,
      addresses.SimpleMarket,
      v,
      r,
      s
    ]
  );
  const fundOwned = await version.instance.managerToFunds.call({}, [manager]);
  // const keccakedName = await api.web3.sha3(['Super Fund']);
  const keccakedName = "0xf00030b282fd20568935f96740d5f79e0c72840d3c09a34d1c4c29210e6dddbe";
  const ownerOfFundName = await version.instance.fundNamesToOwners.call({}, [keccakedName]);
  const listOfFunds = await version.instance.listOfFunds.call({}, [0]);
  console.log(preLastFundId);
  t.is(fundOwned.length, 42);
  t.is(ownerOfFundName, manager)
});

test('Can shutdown a fund', async t => {
  //t.truthy(versionShutDown);
});
