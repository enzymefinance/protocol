import test from "ava";
import web3 from "../../../utils/lib/web3";
import deployEnvironment from "../../../utils/deploy/contracts";
import { deployContract, retrieveContract } from "../../../utils/lib/contracts";
import {
  getTermsSignatureParameters,
  getSignatureParameters,
} from "../../../utils/lib/signing";
import getChainTime from "../../../utils/lib/getChainTime";
import { increaseTime } from "../../../utils/lib/time";
import { updateCanonicalPriceFeed } from "../../../utils/lib/updatePriceFeed";

const environmentConfig = require("../../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];
const competitionTerms =
  "0x12208E21FD34B8B2409972D30326D840C9D747438A118580D6BA8C0735ED53810491";

const fundName = web3.utils.toHex("Super Fund");

// hoisted variables
let accounts;
let deployer;
let manager;
let opts;

async function registerFund(t, fundAddress, by, value) {
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
  opts = { from: manager, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(async t => {
  t.context.deployed = await deployEnvironment(environment);
  t.context.canonicalPriceFeed = t.context.deployed.CanonicalPriceFeed;
  t.context.competitionCompliance = await deployContract(
    "compliance/CompetitionCompliance",
    opts,
    [accounts[0]],
  );
  t.context.version = await deployContract(
    "version/Version",
    {from: manager, gas: 6800000 },
    [
      "1",
      t.context.deployed.Governance.options.address,
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
    {from: manager, gas: 6800000 },
    [
      t.context.deployed.MlnToken.options.address,
      t.context.version.options.address,
      accounts[5],
      blockchainTime,
      blockchainTime + 86400,
      new BigNumber(22 * 10 ** 18),
      new BigNumber(10 ** 23),
      10
    ],
    () => {},
    true,
  );

  // Change competition address to the newly deployed competition and add manager to whitelist
  await t.context.competitionCompliance.methods.changeCompetitionAddress(t.context.competition.options.address).send(
    opts,
  );
  await t.context.competition.methods.batchAddToWhitelist(
    new BigNumber(10 ** 25), [manager]
  ).send(opts);
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await t.context.version.methods.setupFund(
    fundName,
    t.context.deployed.EthToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    t.context.deployed.NoCompliance.options.address,
    t.context.deployed.RMMakeOrders.options.address,
    [t.context.deployed.MatchingMarket.options.address],
    [t.context.deployed.MlnToken.options.address],
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

test(
  "Cannot register in the Competition without being whitelisted",
  async t => {
    await t.throws(registerFund(t, t.context.fund.options.address, deployer, new BigNumber(10 ** 19)));
  },
);

test(
  "Cannot register fund someone else owns even if whitelisted",
  async t => {
    await t.context.competition.methods.batchAddToWhitelist(new BigNumber(10 ** 22), [deployer]).send(opts);
    await t.throws(registerFund(t, t.context.fund.options.address, deployer, new BigNumber(10 ** 19)));
  },
);

test("Can register from a whitelisted account", async t => {
  const registrantFund = await registerFund(t, t.context.fund.options.address, manager, 10);
  t.is(registrantFund, t.context.fund.options.address);
});

test("Cannot register for more than individual maxBuyin", async t => {
  await t.throws(registerFund(t, t.context.fund.options.address, manager, new BigNumber(10 ** 24)));
});

test(
  "Cannot register twice even if individual maxBuyin is not reached",
  async t => {
    const buyInAmount = new BigNumber(10 ** 19);
    await registerFund(t, t.context.fund.options.address, manager, buyInAmount);
    const fundMlnOnFirst = await t.context.deployed.MlnToken.methods.balanceOf.call({}, [
      t.context.fund.options.address,
    ]);
    await t.throws(registerFund(t, t.context.fund.options.address, manager, buyInAmount));
    const expectedReward = await t.context.competition.methods.calculatePayout.call({}, [buyInAmount]);

    t.is(Number(fundMlnOnFirst), Number(expectedReward));
  },
);

test(
  "Mln deposited to the fund is deterministic",
  async t => {
    const buyInAmount = new BigNumber(10 ** 19);
    await registerFund(t, t.context.fund.options.address, manager, buyInAmount);
    const fundMln = await t.context.deployed.MlnToken.methods.balanceOf(t.context.fund.options.address).call();
    const fundSupply = await t.context.fund.methods.totalSupply().call();
    const expectedReward = await t.context.competition.methods.calculatePayout(buyInAmount).call();

    await t.context.competition.methods.batchAddToWhitelist(new BigNumber(10 ** 25), [deployer]).send(opts);
    const [r, s, v] = await getTermsSignatureParameters(deployer);
    await t.context.version.methods.setupFund(
      web3.utils.toHex("Second"),
      t.context.deployed.EthToken.options.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      t.context.deployed.NoCompliance.options.address,
      t.context.deployed.RMMakeOrders.options.address,
      [t.context.deployed.MatchingMarket.options.address],
      [t.context.deployed.MlnToken.options.address],
      v,
      r,
      s,
    ).send({ from: deployer, gas: config.gas, gasPrice: config.gasPrice });
    const fundAddress = await t.context.version.methods.managerToFunds(deployer).call();
    const secondFund = await retrieveContract("Fund", fundAddress);
    const {0: mlnPrice} = await t.context.canonicalPriceFeed.methods.getPrice(t.context.deployed.MlnToken.options.address).call();
    await updateCanonicalPriceFeed(t.context.deployed, {
      [t.context.deployed.EthToken.options.address]: new BigNumber(10 ** 18),
      [t.context.deployed.MlnToken.options.address]: new BigNumber(mlnPrice).mul(4.78 * 10 ** 18).div(10 ** 18),
    });
    await registerFund(t, secondFund.options.address, deployer, buyInAmount);
    const secondFundMln = await t.context.deployed.MlnToken.methods.balanceOf(t.context.fund.options.address).call();
    const secondFundSupply = await secondFund.methods.totalSupply().call();

    t.deepEqual(fundMln, secondFundMln);
    t.is(Number(fundMln), Number(expectedReward));;
    t.true(fundSupply < secondFundSupply);
  },
);

test("Cannot register after endTime", async t => {
  const competitionDuration = 5000;
  const blockchainTime = await getChainTime();

  t.context.competition = await deployContract(
    "competitions/Competition",
    {from: manager, gas: 6800000},
    [
      t.context.deployed.MlnToken.options.address,
      t.context.version.options.address,
      accounts[5],
      blockchainTime,
      blockchainTime + competitionDuration,
      new BigNumber(22 * 10 ** 18),
      new BigNumber(10 ** 23),
      10,
    ],
    () => {},
    true,
  );

  await t.context.competitionCompliance.methods.changeCompetitionAddress(t.context.competition.options.address).send(
    {from: manager}
  );

  t.context.competition.methods.batchAddToWhitelist(
    web3.utils.toBN(new BigNumber(10 ** 22)), [manager]
  ).send({from: deployer})

  // Send some MLN to competition contract
  await t.context.deployed.MlnToken.methods.transfer(
    t.context.competition.options.address, new BigNumber(10 ** 24)
  ).send({ from: deployer });

  await increaseTime(competitionDuration);

  await t.throws(
    registerFund(t, t.context.fund.options.address, manager, 10)
  );
});

test("Cannot register before startTime", async t => {
  const blockchainTime = await getChainTime();
  t.context.competition = await deployContract(
    "competitions/Competition",
    Object.assign(opts, { gas: 6800000 }),
    [
      t.context.deployed.MlnToken.options.address,
      t.context.version.options.address,
      accounts[5],
      blockchainTime - 86400,
      blockchainTime - 86400,
      new BigNumber(22 * 10 ** 18),
      new BigNumber(10 ** 22),
      10
    ],
    () => {},
    true,
  );
  console.log('pachaa');
  await t.context.competitionCompliance.methods.changeCompetitionAddress(t.context.competition.options.address).send(opts);
  await t.context.competition.methods.batchAddToWhitelist(new BigNumber(10 ** 22), [manager]).send(opts);
  // Send some MLN to competition contract
  await t.context.deployed.MlnToken.methods.transfer(t.context.competition.options.address, new BigNumber(10 ** 24)).send(opts);
  await t.throws(registerFund(t, t.context.fund.options.address, manager, 10));
});

test(
  "Cannot register if max number of registrants is reached",
  async t => {
    const blockchainTime = await getChainTime();
    t.context.competition = await deployContract(
      "competitions/Competition",
      opts,
      [
        t.context.deployed.MlnToken.options.address,
        t.context.version.options.address,
        accounts[5],
        blockchainTime,
        blockchainTime + 86400,
        new BigNumber(22 * 10 ** 18),
        new BigNumber(10 ** 22),
        0
      ],
      () => {},
      true,
    );
    console.log('Gnope');
    await t.context.competitionCompliance.methods.changeCompetitionAddress(t.context.competition.options.address).send(opts);
    await t.context.competition.methods.batchAddToWhitelist(new BigNumber(10 ** 22), [manager]).send(opts);
    // Send some MLN to competition contract
    await t.context.deployed.MlnToken.methods.transfer(t.context.competition.options.address, new BigNumber(10 ** 24)).send({ from: deployer, gasPrice: config.gasPrice });
    await t.throws(registerFund(t, t.context.fund.options.address, manager, 10));
  },
);
