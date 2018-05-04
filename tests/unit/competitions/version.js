import test from "ava";
import api from "../../../utils/lib/api";
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
let deployed;
let version;

const fundName = "Super Fund";

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [, manager, , , nonwhitelist] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
  version = deployed.Version;
});

test("Cannot setup a new fund without whitelist in Competition", async t => {
  const [r, s, v] = await getTermsSignatureParameters(nonwhitelist);
  await version.instance.setupFund.postTransaction(
    { from: nonwhitelist, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundName,
      deployed.MlnToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      v,
      r,
      s,
    ],
  );
  const lastFundId = await version.instance.getLastFundId.call({}, []);
  const lastFund = await version.instance.getFundById.call({}, [lastFundId]);
  t.is(lastFund, "0x0000000000000000000000000000000000000000");
});

test("Can setup a new fund from whitelisted account", async t => {
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(opts, [
    fundName,
    deployed.MlnToken.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.address,
    deployed.RMMakeOrders.address,
    [deployed.MatchingMarket.address],
    v,
    r,
    s,
  ]);
  const lastFundId = await version.instance.getLastFundId.call({}, []);
  const lastFund = await version.instance.getFundById.call({}, [lastFundId]);
  t.not(lastFund, "0x0000000000000000000000000000000000000000");
});
