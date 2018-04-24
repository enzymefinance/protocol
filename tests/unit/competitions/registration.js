import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import { deployContract, retrieveContract } from "../../../utils/lib/contracts";
import { getTermsSignatureParameters, getSignatureParameters } from "../../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../../utils/lib/updatePriceFeed";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const competitionTerms =
  "0x1A46B45CC849E26BB3159298C3C218EF300D015ED3E23495E77F0E529CE9F69E";

// hoisted variables
let accounts;
let manager;
let deployer;
let opts;
let deployed;
let version;
let competition;
let competitionCompliance;
let fund;

const fundName = "Super Fund";

async function registerFund(fundAddress, by, value) {
  await updateCanonicalPriceFeed(deployed);
  const [r, s, v] = await getSignatureParameters(by, competitionTerms);
  await competition.instance.registerForCompetition.postTransaction(
    {
      from: by,
      gas: config.gas,
      gasPrice: config.gasPrice,
      value,
    },
    [fundAddress, v, r, s],
  );
}

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async () => {
  competitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [accounts[0]]);
  version = await deployContract("version/Version", Object.assign(opts, {gas: 6800000}), [1, deployed.Governance.address, deployed.EthToken.address, deployed.MlnToken.address, deployed.CanonicalPriceFeed.address, competitionCompliance.address], () => {}, true);
  competition = await deployContract("competitions/Competition", Object.assign(opts, {gas: 6800000}), [deployed.MlnToken.address, version.address, accounts[5], Math.round(new Date().getTime() / 1000), Math.round(new Date().getTime() / 1000) + 86400, 10 ** 17, 10 ** 22, 10], () => {}, true);

  // Change competition address to the newly deployed competition and add manager to whitelist
  await competitionCompliance.instance.changeCompetitionAddress.postTransaction(opts, [competition.address]);
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [10 ** 22, [manager]]);
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
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
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);

  // Send some MLN to competition contract
  await deployed.MlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [competition.address, 10 ** 24, ""],
  );
});

test("Cannot register in the Competition without being whitelisted", async t => {
  await registerFund(fund.address, deployer, 10);
  const registrantFund = await competition.instance.getRegistrantFund.call({}, [
    manager,
  ]);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test("Cannot register fund someone else owns even if whitelisted", async t => {
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [10 ** 22, [deployer]]);
  await registerFund(fund.address, deployer, 10);
  const registrantFund = await competition.instance.getRegistrantFund.call({}, [
    deployer,
  ]);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test("Can setup a new fund from whitelisted account", async t => {
  await registerFund(fund.address, manager, 10);
  const registrantFund = await competition.instance.getRegistrantFund.call({}, [
    manager,
  ]);
  t.is(registrantFund, fund.address);
});
