import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import { deployContract, retrieveContract } from "../../../utils/lib/contracts";
import {
  getTermsSignatureParameters,
  getSignatureParameters,
} from "../../../utils/lib/signing";
import getChainTime from "../../../utils/lib/getChainTime";
import { updateCanonicalPriceFeed } from "../../../utils/lib/updatePriceFeed";

const environmentConfig = require("../../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];
const competitionTerms =
  "0x1A46B45CC849E26BB3159298C3C218EF300D015ED3E23495E77F0E529CE9F69E";

const fundName = "Super Fund";

// hoisted variables
let accounts;
let deployer;
let manager;
let opts;

async function registerFund(t, fundAddress, by, value) {
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
  t.context.canonicalPriceFeed = t.context.deployed.CanonicalPriceFeed;
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
      t.context.deployed.Governance.address,
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
      10 ** 23,
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
    10 ** 25,
    [manager],
  ]);
  const [r, s, v] = await getTermsSignatureParameters(manager);
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
      [t.context.deployed.MlnToken.address],
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

test(
  "Cannot register in the Competition without being whitelisted",
  async t => {
    const registrantFund = await registerFund(t, t.context.fund.address, deployer, 10 ** 19);
    t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  },
);

test(
  "Cannot register fund someone else owns even if whitelisted",
  async t => {
    await t.context.competition.instance.batchAddToWhitelist.postTransaction(opts, [
      10 ** 22,
      [deployer],
    ]);
    const registrantFund = await registerFund(t, t.context.fund.address, deployer, 10 ** 19);
    t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  },
);

test("Can register from a whitelisted account", async t => {
  const registrantFund = await registerFund(t, t.context.fund.address, manager, 10);
  t.is(registrantFund, t.context.fund.address);
});

test("Cannot register for more than individual maxBuyin", async t => {
  const registrantFund = await registerFund(t, t.context.fund.address, manager, 10 ** 24);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test(
  "Cannot register twice even if individual maxBuyin is not reached",
  async t => {
    const buyInAmount = new BigNumber(10 ** 19);
    await registerFund(t, t.context.fund.address, manager, buyInAmount);
    const fundMlnOnFirst = await t.context.deployed.MlnToken.instance.balanceOf.call({}, [
      t.context.fund.address,
    ]);
    await registerFund(t, t.context.fund.address, manager, buyInAmount);
    const fundMlnOnSecond = await t.context.deployed.MlnToken.instance.balanceOf.call(
      {},
      [t.context.fund.address],
    );
    const expectedReward = await t.context.competition.instance.calculatePayout.call({}, [buyInAmount]);

    t.deepEqual(fundMlnOnFirst, expectedReward);
    t.deepEqual(fundMlnOnSecond, fundMlnOnFirst);
  },
);

test(
  "Mln deposited to the fund is deterministic",
  async t => {
    const buyInAmount = new BigNumber(10 ** 19);
    await registerFund(t, t.context.fund.address, manager, buyInAmount);
    const fundMln = await t.context.deployed.MlnToken.instance.balanceOf.call({}, [
      t.context.fund.address,
    ]);
    const fundSupply = await t.context.fund.instance.totalSupply.call({}, []);
    const expectedReward = await t.context.competition.instance.calculatePayout.call({}, [buyInAmount]);

    await t.context.competition.instance.batchAddToWhitelist.postTransaction(opts, [
      10 ** 25,
      [deployer],
    ]);
    const [r, s, v] = await getTermsSignatureParameters(deployer);
    await t.context.version.instance.setupFund.postTransaction(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
      [
        "Second",
        t.context.deployed.EthToken.address, // base asset
        config.protocol.fund.managementFee,
        config.protocol.fund.performanceFee,
        t.context.deployed.NoCompliance.address,
        t.context.deployed.RMMakeOrders.address,
        [t.context.deployed.MatchingMarket.address],
        [t.context.deployed.MlnToken.address],
        v,
        r,
        s,
      ],
    );
    const fundAddress = await t.context.version.instance.managerToFunds.call({}, [deployer]);
    const secondFund = await retrieveContract("Fund", fundAddress);
    const [mlnPrice, ] = await t.context.canonicalPriceFeed.instance.getPrice.call({}, [t.context.deployed.MlnToken.address])
    await updateCanonicalPriceFeed(t.context.deployed, {
      [t.context.deployed.EthToken.address]: new BigNumber(10 ** 18),
      [t.context.deployed.MlnToken.address]: new BigNumber(mlnPrice).mul(4.78 * 10 ** 18).div(10 ** 18),
    });
    await registerFund(t, secondFund.address, deployer, buyInAmount);
    const secondFundMln = await t.context.deployed.MlnToken.instance.balanceOf.call({}, [
      t.context.fund.address,
    ]);
    const secondFundSupply = await secondFund.instance.totalSupply.call({}, []);

    t.deepEqual(fundMln, secondFundMln);
    t.deepEqual(fundMln, expectedReward);;
    t.true(fundSupply < secondFundSupply);
  },
);

test("Cannot register after endTime", async t => {
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
      blockchainTime - 86400,
      22 * 10 ** 18,
      10 ** 22,
      10,
    ],
    () => {},
    true,
  );
  await t.context.competitionCompliance.instance.changeCompetitionAddress.postTransaction(
    opts,
    [t.context.competition.address],
  );
  await t.context.competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [manager],
  ]);
  // Send some MLN to competition contract
  await t.context.deployed.MlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [t.context.competition.address, 10 ** 24, ""],
  );
  const registrantFund = await registerFund(t, t.context.fund.address, manager, 10);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test("Cannot register before startTime", async t => {
  const blockchainTime = await getChainTime();
  t.context.competition = await deployContract(
    "competitions/Competition",
    Object.assign(opts, { gas: 6800000 }),
    [
      t.context.deployed.MlnToken.address,
      t.context.deployed.EurToken.address,
      t.context.version.address,
      accounts[5],
      blockchainTime - 86400,
      blockchainTime - 86400,
      22 * 10 ** 18,
      10 ** 22,
      10,
    ],
    () => {},
    true,
  );
  await t.context.competitionCompliance.instance.changeCompetitionAddress.postTransaction(
    opts,
    [t.context.competition.address],
  );
  await t.context.competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [manager],
  ]);
  // Send some MLN to competition contract
  await t.context.deployed.MlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [t.context.competition.address, 10 ** 24, ""],
  );
  const registrantFund = await registerFund(t, t.context.fund.address, manager, 10);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test(
  "Cannot register if max number of registrants is reached",
  async t => {
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
        0,
      ],
      () => {},
      true,
    );
    await t.context.competitionCompliance.instance.changeCompetitionAddress.postTransaction(
      opts,
      [t.context.competition.address],
    );
    await t.context.competition.instance.batchAddToWhitelist.postTransaction(opts, [
      10 ** 22,
      [manager],
    ]);
    // Send some MLN to competition contract
    await t.context.deployed.MlnToken.instance.transfer.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [t.context.competition.address, 10 ** 24, ""],
    );
    const registrantFund = await registerFund(t, t.context.fund.address, manager, 10);
    t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  },
);
