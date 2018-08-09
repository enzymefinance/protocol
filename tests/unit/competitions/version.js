import test from "ava";
import web3 from "../../../utils/lib/web3";
import deployEnvironment from "../../../utils/deploy/contracts";
import { getTermsSignatureParameters } from "../../../utils/lib/signing";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let nonwhitelist;
let manager;
let opts;

const fundName = web3.utils.toHex("Super Fund");

test.before(async () => {
  accounts = await web3.eth.getAccounts();
  [, manager, , , nonwhitelist] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async t => {
  t.context.deployed = await deployEnvironment(environment);
  t.context.version = t.context.deployed.Version;
});

test("Cannot setup a new fund without whitelist in Competition", async t => {
  const [r, s, v] = await getTermsSignatureParameters(nonwhitelist);
  await t.throws(t.context.version.methods.setupFund(
    fundName,
    t.context.deployed.MlnToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    t.context.deployed.NoCompliance.options.address,
    t.context.deployed.RMMakeOrders.options.address,
    [t.context.deployed.MatchingMarket.options.address],
    [t.context.deployed.MlnToken.options.address],
    v,
    r,
    s,
  ).send({ from: nonwhitelist, gas: config.gas, gasPrice: config.gasPrice }));
});

test("Can setup a new fund from whitelisted account", async t => {
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await t.context.version.methods.setupFund(
    fundName,
    t.context.deployed.MlnToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    t.context.deployed.NoCompliance.options.address,
    t.context.deployed.RMMakeOrders.options.address,
    [t.context.deployed.MatchingMarket.options.address],
    [t.context.deployed.MlnToken.options.address],
    v,
    r,
    s,
  ).send(opts);
  const lastFundId = await t.context.version.methods.getLastFundId().call();
  const lastFund = await t.context.version.methods.getFundById(lastFundId).call();
  t.not(lastFund, "0x0000000000000000000000000000000000000000");
});
