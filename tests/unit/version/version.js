import test from "ava";
import Api from "@parity/api";
import { version } from "../../../utils/lib/utils.js";

const addressBook = require("../../../addressBook.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../../../utils/config/environment.js");
const fs = require("fs");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let deployer;
let manager;
let worker;
let investor;
let opts;

const addresses = addressBook[environment];

// mock data
const fundName = "Super Fund";
// const keccakedName = await api.web3.sha3(['Super Fund']);
const keccakedFundName =
  "0xf00030b282fd20568935f96740d5f79e0c72840d3c09a34d1c4c29210e6dddbe";

test.before(async t => {
  accounts = await api.eth.accounts();
  deployer = accounts[0];
  manager = accounts[1];
  investor = accounts[2];
  worker = accounts[3];
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test("Can setup a new fund", async t => {
  const hash =
    "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  await version.instance.setupFund.postTransaction(opts, [
    "Super Fund", // name
    addresses.MlnToken, // reference asset
    0,
    0,
    addresses.NoCompliance,
    addresses.RMMakeOrders,
    addresses.PriceFeed,
    addresses.SimpleMarket,
    v,
    r,
    s,
  ]);
  const fundOwned = await version.instance.managerToFunds.call({}, [manager]);
  const ownerOfFundName = await version.instance.fundNamesToOwners.call({}, [
    keccakedFundName,
  ]);

  t.is(fundOwned.length, 42);
  t.is(ownerOfFundName, manager);
});

test.serial("Can shutdown a fund", async t => {
  const lastFundId = await version.instance.getLastFundId.call({}, []);
  const lastFund = await version.instance.listOfFunds.call({}, [lastFundId]);
  await version.instance.shutDownFund.postTransaction(opts, [lastFund]);
  const ownerOfFundName = await version.instance.fundNamesToOwners.call({}, [
    keccakedFundName,
  ]);
  const fundOwned = await version.instance.managerToFunds.call({}, [manager]);
  t.is(fundOwned, "0x0000000000000000000000000000000000000000");
  t.is(ownerOfFundName, "0x0000000000000000000000000000000000000000");
});
