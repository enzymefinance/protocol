import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import getSignatureParameters from "../../../utils/lib/getSignatureParameters";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let manager;
let opts;
let deployed;
let version;

const fundName = "Super Fund";
const keccakedFundName = "0xf00030b282fd20568935f96740d5f79e0c72840d3c09a34d1c4c29210e6dddbe";

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [ , , , , manager] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
  version = deployed.Version;
});

test("Can setup a new fund", async t => {
  const [r, s, v] = await getSignatureParameters(manager);
  const txId = await version.instance.setupFund.postTransaction(opts, [
    fundName,
    deployed.MlnToken.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.address,
    deployed.RMMakeOrders.address,
    deployed.PriceFeed.address,
    [deployed.SimpleMarket.address],
    [deployed.SimpleAdapter.address],
    v,
    r,
    s,
  ]);
  const receipt = await api.eth.getTransactionReceipt(txId);
  const fundAddress = api.util.toChecksumAddress(`0x${receipt.logs[0].data.slice(-40)}`);
  const fundOwned = await version.instance.managerToFunds.call({}, [manager]);
  const ownerOfFundName = await version.instance.fundNamesToOwners.call({}, [keccakedFundName]);

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
