import test from "ava";
import web3 from "../../../utils/lib/web3";
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
  "0x12208E21FD34B8B2409972D30326D840C9D747438A118580D6BA8C0735ED53810491";

// hoisted variables
let accounts;
let manager;
let deployer;
let opts;

const fundName = web3.utils.toHex("Super Fund");

async function registerFund(t, fundAddress, by, value) {
  await updateCanonicalPriceFeed(t.context.deployed);
  const [r, s, v] = await getSignatureParameters(by, competitionTerms);
  await t.context.competition.methods.registerForCompetition(fundAddress, v, r, s).send(
    {
      from: by,
      gas: config.gas,
      gasPrice: config.gasPrice,
      value,
    },
  );
  return t.context.competition.methods.getRegistrantFund(by).call();
}

test.before(async () => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
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
      "1",
      deployer, // For easy shutdown
      t.context.deployed.MlnToken.options.address,
      t.context.deployed.EthToken.options.address,
      t.context.deployed.CanonicalPriceFeed.options.address,
      t.context.competitionCompliance.options.address,
    ],
    () => {},
    true,
  );
  const blockchainTime = await getChainTime();
  t.context.competition = await deployContract(
    "competitions/Competition",
    Object.assign(opts, { gas: 6800000 }),
    [
      t.context.deployed.MlnToken.options.address,
      t.context.version.options.address,
      accounts[5],
      blockchainTime,
      blockchainTime + 86400,
      new BigNumber(22 * 10 ** 18),
      new BigNumber(10 ** 22),
      10
    ],
    () => {},
    true,
  );

  // Change competition address to the newly deployed competition and add manager to whitelist
  await t.context.competitionCompliance.methods.changeCompetitionAddress(t.context.competition.options.address).send(opts);
  await t.context.competition.methods.batchAddToWhitelist(new BigNumber(10 ** 22), [manager]).send(opts);
  const [r, s, v] = await getTermsSignatureParameters(manager);
  // Without passing MLN in default assets list
  await t.context.version.methods.setupFund(
    fundName,
    t.context.deployed.EthToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    t.context.deployed.NoCompliance.options.address,
    t.context.deployed.RMMakeOrders.options.address,
    [t.context.deployed.MatchingMarket.options.address],
    [],
    v,
    r,
    s,
  ).send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });
  const fundAddress = await t.context.version.methods.managerToFunds(manager).call();
  t.context.fund = await retrieveContract("Fund", fundAddress);

  // Send some MLN to competition contract
  await t.context.deployed.MlnToken.methods.transfer(t.context.competition.options.address, new BigNumber(10 ** 24)).send(
    { from: deployer, gasPrice: config.gasPrice },
  );
  await updateCanonicalPriceFeed(t.context.deployed);
});

test("Cannot redeem before end time", async t => {
  const registrantFund = await registerFund(t, t.context.fund.options.address, manager, new BigNumber(10 ** 14));
  const managerPreShares = await t.context.fund.methods.balanceOf(manager).call();
  await t.throws(t.context.competition.methods.claimReward().send(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
  ));
  const managerPostShares = await t.context.fund.methods.balanceOf(manager).call();
  t.not(registrantFund, "0x0000000000000000000000000000000000000000");
  t.deepEqual(managerPreShares, managerPostShares);
});

test("Cannot redeem without being registered", async t => {
  const managerPreShares = await t.context.fund.methods.balanceOf(manager).call();
  await t.throws(t.context.competition.methods.claimReward().send(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    },
  ));
  const managerPostShares = await t.context.fund.methods.balanceOf(manager).call();
  t.deepEqual(managerPreShares, managerPostShares);
});

test("Can redeem before endTime if version is shutdown", async t => {
  const buyinValue = new BigNumber(10 ** 19);
  const registrantFund = await registerFund(t, t.context.fund.options.address, manager, buyinValue);
  await t.context.version.methods.shutDown().send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );
  const versionShutDown = await t.context.version.methods.isShutDown().call();
  const payoutRate = await t.context.competition.methods.payoutRate().call();
  const expectedPayout = buyinValue.mul(payoutRate).div(10 ** 18);
  const expectedShares = await t.context.competition.methods.getEtherValue(expectedPayout).call();
  const fundPreSupply = await t.context.fund.methods.totalSupply().call();
  const managerPreShares = await t.context.fund.methods.balanceOf(manager).call();
  const competitionPreShares = await t.context.fund.methods.balanceOf(t.context.competition.options.address).call();
  await t.context.competition.methods.claimReward().send(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    }
  );
  const fundPostSupply = await t.context.fund.methods.totalSupply().call();
  const managerPostShares = await t.context.fund.methods.balanceOf(manager).call();
  const competitionPostShares = await t.context.fund.methods.balanceOf(t.context.competition.options.address).call();
  t.is(registrantFund, t.context.fund.options.address);
  t.true(versionShutDown);
  t.deepEqual(fundPostSupply, fundPreSupply);
  t.deepEqual(Number(managerPostShares), Number(managerPreShares) + Number(expectedShares));
  t.deepEqual(Number(competitionPostShares), Number(competitionPreShares) - Number((expectedShares)));
});

test("Owner can and only they can withdraw MLN deposited to the contract", async t => {
  const deployerPreMln = new BigNumber(await t.context.deployed.MlnToken.methods.balanceOf(deployer).call());
  const competitionPreMln = await t.context.deployed.MlnToken.methods.balanceOf(t.context.competition.options.address).call();
  await t.context.competition.methods.withdrawMln(manager, competitionPreMln).send(opts);
  await t.throws(t.context.competition.methods.withdrawMln(deployer, competitionPreMln).send(opts));
  const deployerPostMln = new BigNumber(await t.context.deployed.MlnToken.methods.balanceOf(deployer).call());
  const competitionPostMln = await t.context.deployed.MlnToken.methods.balanceOf(t.context.competition.options.address).call();
  t.is(Number(competitionPostMln), 0);
  t.deepEqual(deployerPostMln, deployerPreMln.add(competitionPreMln));
});
