import test from "ava";
import Api from "@parity/api";
import * as instances from "../../../utils/lib/instances";
import { version } from "../../../utils/lib/utils";

const addressBook = require("../../../addressBook.json");
const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let manager;
let opts;

const addresses = addressBook[environment];

const keccakedFundName =
  "0xf00030b282fd20568935f96740d5f79e0c72840d3c09a34d1c4c29210e6dddbe";

test.before(async () => {
  accounts = await api.eth.accounts();
  manager = accounts[1];
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
    fundName, // name
    addresses.MlnToken, // reference asset
    config.protocol.fund.managementReward,
    config.protocol.fund.performanceReward,
    addresses.NoCompliance,
    addresses.RMMakeOrders,
    addresses.PriceFeed,
    addresses.SimpleMarket,
    v,
    r,
    s,
  ]);
  const receipt = await api.eth.getTransactionReceipt(txId);
  const fundAddress = api.util.toChecksumAddress(`0x${receipt.logs[0].data.slice(-40)}`);
  const fundOwned = await instances.version.instance.managerToFunds.call({}, [manager]);
  const ownerOfFundName = await instances.version.instance.fundNamesToOwners.call({}, [
    keccakedFundName,
  ]);

  t.is(fundOwned, fundAddress);
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
