import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import {getTermsSignatureParameters} from "../../../utils/lib/signing";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let manager;
let opts;

const fundName = "Super Fund";

test.before(async () => {
  accounts = await api.eth.accounts();
  [ , manager] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async t => {
  t.context.deployed = await deployEnvironment(environment);
  t.context.version = t.context.deployed.Version;
  const [r, s, v] = await getTermsSignatureParameters(manager);
  t.context.txId = await t.context.version.instance.setupFund.postTransaction(opts, [
    fundName,
    t.context.deployed.MlnToken.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    t.context.deployed.NoCompliance.address,
    t.context.deployed.RMMakeOrders.address,
    [t.context.deployed.MatchingMarket.address],
    [],
    v,
    r,
    s,
  ]);
});

test("Can setup a new fund", async t => {
  const receipt = await api.eth.getTransactionReceipt(t.context.txId);
  const fundAddress = api.util.toChecksumAddress(`0x${receipt.logs[0].data.slice(-40)}`);
  const fundOwned = await t.context.version.instance.managerToFunds.call({}, [manager]);

  t.is(fundOwned, fundAddress);
});

test("Can shutdown a fund", async t => {
  const lastFundId = await t.context.version.instance.getLastFundId.call({}, []);
  const lastFund = await t.context.version.instance.listOfFunds.call({}, [lastFundId]);
  await t.context.version.instance.shutDownFund.postTransaction(opts, [lastFund]);
  const fundOwned = await t.context.version.instance.managerToFunds.call({}, [manager]);
  t.is(fundOwned, "0x0000000000000000000000000000000000000000");
});
