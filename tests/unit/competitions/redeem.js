import test from "ava";
import api from "../../../utils/lib/api";
import getChainTime from "../../../utils/lib/getChainTime";
import deployEnvironment from "../../../utils/deploy/contracts";
import { deployContract, retrieveContract } from "../../../utils/lib/contracts";
import {
  getTermsSignatureParameters,
  getSignatureParameters,
} from "../../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../../utils/lib/updatePriceFeed";

const environmentConfig = require("../../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];
const competitionTerms =
  "0x1A46B45CC849E26BB3159298C3C218EF300D015ED3E23495E77F0E529CE9F69E";

// hoisted variables
let accounts;
let manager;
let deployer;
let opts;

const fundName = "Super Fund";

async function registerFund(t, fundAddress, by, value) {
  await updateCanonicalPriceFeed(t.context.deployed);
  const [r, s, v] = await getSignatureParameters(by, competitionTerms);
  await t.context.competition.instance.registerForCompetition.postTransaction(
    {
      from: by,
      gas: config.gas,
      gasPrice: config.gasPrice,
      value,
    },
    [fundAddress, v, r, s],
  );
  return t.context.competition.instance.getRegistrantFund.call({}, [by]);
}

test.before(async () => {
  accounts = await api.eth.accounts();
  [deployer, manager] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async t => {
  t.context.deployed = await deployEnvironment(environment);
  t.context.competitionCompliance = await deployContract(
    "compliance/CompetitionCompliance",
    opts,
    [accounts[0]],
  );
  t.context.version = await deployContract(
    "version/Version",
    Object.assign(opts, { gas: 6800000 }),
    [
      1,
      deployer, // For easy shutdown
      t.context.deployed.MlnToken.address,
      t.context.deployed.EthToken.address,
      t.context.deployed.CanonicalPriceFeed.address,
      t.context.competitionCompliance.address,
    ],
    () => {},
    true,
  );
  const blockchainTime = await getChainTime();
  t.context.competition = await deployContract(
    "competitions/Competition",
    Object.assign(opts, { gas: 6800000 }),
    [
      t.context.deployed.MlnToken.address,
      t.context.deployed.EurToken.address,
      t.context.version.address,
      accounts[5],
      blockchainTime,
      blockchainTime + 86400,
      22 * 10 ** 18,
      10 ** 22,
      10,
    ],
    () => {},
    true,
  );

  // Change competition address to the newly deployed competition and add manager to whitelist
  await t.context.competitionCompliance.instance.changeCompetitionAddress.postTransaction(
    opts,
    [t.context.competition.address],
  );
  await t.context.competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [manager],
  ]);
  const [r, s, v] = await getTermsSignatureParameters(manager);
  // Without passing MLN in default assets list
  await t.context.version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundName,
      t.context.deployed.EthToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      t.context.deployed.NoCompliance.address,
      t.context.deployed.RMMakeOrders.address,
      [t.context.deployed.MatchingMarket.address],
      [],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await t.context.version.instance.managerToFunds.call({}, [manager]);
  t.context.fund = await retrieveContract("Fund", fundAddress);

  // Send some MLN to competition contract
  await t.context.deployed.MlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [t.context.competition.address, 10 ** 24, ""],
  );
  await updateCanonicalPriceFeed(t.context.deployed);
});

test.serial("Cannot redeem before end time", async t => {
  const registrantFund = await registerFund(t, t.context.fund.address, manager, 10 ** 14);
  const managerPreShares = await t.context.fund.instance.balanceOf.call({}, [manager]);
  await t.context.competition.instance.claimReward.postTransaction(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
    [],
  );
  const managerPostShares = await t.context.fund.instance.balanceOf.call({}, [manager]);
  t.not(registrantFund, "0x0000000000000000000000000000000000000000");
  t.deepEqual(managerPreShares, managerPostShares);
});

test.serial("Cannot redeem without being registered", async t => {
  const registrantFund = await t.context.competition.instance.getRegistrantFund.call({}, [
    manager,
  ]);
  const managerPreShares = await t.context.fund.instance.balanceOf.call({}, [manager]);
  await t.context.competition.instance.claimReward.postTransaction(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
    [],
  );
  const managerPostShares = await t.context.fund.instance.balanceOf.call({}, [manager]);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  t.deepEqual(managerPreShares, managerPostShares);
});

test.serial("Can redeem before endTime if version is shutdown", async t => {
  const buyinValue = new BigNumber(10 ** 19);
  const registrantFund = await registerFund(t, t.context.fund.address, manager, buyinValue);
  await t.context.version.instance.shutDown.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [],
  );
  const versionShutDown = await t.context.version.instance.isShutDown.call({}, []);
  const payoutRate = await t.context.competition.instance.payoutRate.call({}, []);
  const expectedPayout = buyinValue.mul(payoutRate).div(10 ** 18);
  const expectedShares = await t.context.competition.instance.getEtherValue.call({}, [expectedPayout]);
  const fundPreSupply = await t.context.fund.instance.totalSupply.call({}, []);
  const managerPreShares = await t.context.fund.instance.balanceOf.call({}, [manager]);
  const competitionPreShares = await t.context.fund.instance.balanceOf.call({}, [
    t.context.competition.address,
  ]);
  await t.context.competition.instance.claimReward.postTransaction(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
    [],
  );
  const fundPostSupply = await t.context.fund.instance.totalSupply.call({}, []);
  const managerPostShares = await t.context.fund.instance.balanceOf.call({}, [manager]);
  const competitionPostShares = await t.context.fund.instance.balanceOf.call({}, [
    t.context.competition.address,
  ]);
  t.is(registrantFund, t.context.fund.address);
  t.true(versionShutDown);
  t.deepEqual(fundPostSupply, fundPreSupply);
  t.deepEqual(managerPostShares, managerPreShares.add(expectedShares));
  t.deepEqual(competitionPostShares, competitionPreShares.sub(expectedShares));
});
