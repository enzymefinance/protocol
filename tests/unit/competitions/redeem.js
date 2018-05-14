import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import getChainTime from "../../../utils/lib/getChainTime";
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
  return competition.instance.getRegistrantFund.call({}, [by]);
}

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager] = accounts;
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async () => {
  competitionCompliance = await deployContract(
    "compliance/CompetitionCompliance",
    opts,
    [accounts[0]],
  );
  version = await deployContract(
    "version/Version",
    Object.assign(opts, { gas: 6800000 }),
    [
      1,
      deployer, // For easy shutdown
      deployed.MlnToken.address,
      deployed.EthToken.address,
      deployed.CanonicalPriceFeed.address,
      competitionCompliance.address,
    ],
    () => {},
    true,
  );
  const blockchainTime = await getChainTime();
  competition = await deployContract(
    "competitions/Competition",
    Object.assign(opts, { gas: 6800000 }),
    [
      deployed.MlnToken.address,
      deployed.EurToken.address,
      version.address,
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
  await competitionCompliance.instance.changeCompetitionAddress.postTransaction(
    opts,
    [competition.address],
  );
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [manager],
  ]);
  const [r, s, v] = await getTermsSignatureParameters(manager);
  // Without passing MLN in default assets list
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundName,
      deployed.EthToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      [],
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
  await updateCanonicalPriceFeed(deployed);
});

test.serial("Cannot redeem before end time", async t => {
  const registrantFund = await registerFund(fund.address, manager, 10 ** 14);
  const managerPreShares = await fund.instance.balanceOf.call({}, [manager]);
  await competition.instance.claimReward.postTransaction(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
    [],
  );
  const managerPostShares = await fund.instance.balanceOf.call({}, [manager]);
  t.not(registrantFund, "0x0000000000000000000000000000000000000000");
  t.deepEqual(managerPreShares, managerPostShares);
});

test.serial("Cannot redeem without being registered", async t => {
  const registrantFund = await competition.instance.getRegistrantFund.call({}, [
    manager,
  ]);
  const managerPreShares = await fund.instance.balanceOf.call({}, [manager]);
  await competition.instance.claimReward.postTransaction(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
    [],
  );
  const managerPostShares = await fund.instance.balanceOf.call({}, [manager]);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  t.deepEqual(managerPreShares, managerPostShares);
});

test.serial("Can redeem before endTime if version is shutdown", async t => {
  const buyinValue = new BigNumber(10 ** 19);
  const registrantFund = await registerFund(fund.address, manager, buyinValue);
  await version.instance.shutDown.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [],
  );
  const versionShutDown = await version.instance.isShutDown.call({}, []);
  const payoutRate = await competition.instance.payoutRate.call({}, []);
  const expectedPayout = buyinValue.mul(payoutRate).div(10 ** 18);
  const expectedShares = await competition.instance.getEtherValue.call({}, [expectedPayout]);
  const fundPreSupply = await fund.instance.totalSupply.call({}, []);
  const managerPreShares = await fund.instance.balanceOf.call({}, [manager]);
  const competitionPreShares = await fund.instance.balanceOf.call({}, [
    competition.address,
  ]);
  await competition.instance.claimReward.postTransaction(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
    [],
  );
  const fundPostSupply = await fund.instance.totalSupply.call({}, []);
  const managerPostShares = await fund.instance.balanceOf.call({}, [manager]);
  const competitionPostShares = await fund.instance.balanceOf.call({}, [
    competition.address,
  ]);
  t.is(registrantFund, fund.address);
  t.true(versionShutDown);
  t.deepEqual(fundPostSupply, fundPreSupply);
  t.deepEqual(managerPostShares, managerPreShares.add(expectedShares));
  t.deepEqual(competitionPostShares, competitionPreShares.sub(expectedShares));
});
