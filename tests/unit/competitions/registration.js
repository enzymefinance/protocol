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

// hoisted variables
let accounts;
let manager;
let deployer;
let opts;
let deployed;
let version;
let competition;
let competitionCompliance;
let canonicalPriceFeed;
let fund;

const fundName = "Super Fund";

async function registerFund(fundAddress, by, value) {
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
  canonicalPriceFeed = deployed.CanonicalPriceFeed;
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
      deployed.Governance.address,
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
      2 * 10 ** 18,
      10 ** 23,
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
    10 ** 25,
    [manager],
  ]);
  const [r, s, v] = await getTermsSignatureParameters(manager);
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
      [deployed.MlnToken.address],
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

test.serial(
  "Cannot register in the Competition without being whitelisted",
  async t => {
    const registrantFund = await registerFund(fund.address, deployer, 10 ** 19);
    t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  },
);

test.serial(
  "Cannot register fund someone else owns even if whitelisted",
  async t => {
    await competition.instance.batchAddToWhitelist.postTransaction(opts, [
      10 ** 22,
      [deployer],
    ]);
    const registrantFund = await registerFund(fund.address, deployer, 10 ** 19);
    t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  },
);

test.serial("Can register from a whitelisted account", async t => {
  const registrantFund = await registerFund(fund.address, manager, 10);
  t.is(registrantFund, fund.address);
});

test.serial("Cannot register for more than individual maxBuyin", async t => {
  const registrantFund = await registerFund(fund.address, manager, 10 ** 24);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test.serial(
  "Cannot register twice even if individual maxBuyin is not reached",
  async t => {
    const buyInAmount = new BigNumber(10 ** 19);
    await registerFund(fund.address, manager, buyInAmount);
    const fundMlnOnFirst = await deployed.MlnToken.instance.balanceOf.call({}, [
      fund.address,
    ]);
    await registerFund(fund.address, manager, buyInAmount);
    const fundMlnOnSecond = await deployed.MlnToken.instance.balanceOf.call(
      {},
      [fund.address],
    );
    const expectedReward = await competition.instance.calculatePayout.call({}, [buyInAmount]);
    t.deepEqual(fundMlnOnFirst, expectedReward);
    t.deepEqual(fundMlnOnSecond, fundMlnOnFirst);
  },
);

test.serial(
  "Mln deposited to the fund is deterministic",
  async t => {
    const buyInAmount = new BigNumber(10 ** 19);
    await registerFund(fund.address, manager, buyInAmount);
    const fundMln = await deployed.MlnToken.instance.balanceOf.call({}, [
      fund.address,
    ]);
    const fundSupply = await fund.instance.totalSupply.call({}, []);
    const expectedReward = await competition.instance.calculatePayout.call({}, [buyInAmount]);

    await competition.instance.batchAddToWhitelist.postTransaction(opts, [
      10 ** 25,
      [deployer],
    ]);
    const [r, s, v] = await getTermsSignatureParameters(deployer);
    await version.instance.setupFund.postTransaction(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
      [
        "Second",
        deployed.EthToken.address, // base asset
        config.protocol.fund.managementFee,
        config.protocol.fund.performanceFee,
        deployed.NoCompliance.address,
        deployed.RMMakeOrders.address,
        [deployed.MatchingMarket.address],
        [deployed.MlnToken.address],
        v,
        r,
        s,
      ],
    );
    const fundAddress = await version.instance.managerToFunds.call({}, [deployer]);
    const secondFund = await retrieveContract("Fund", fundAddress);
    const [mlnPrice, ] = await canonicalPriceFeed.instance.getPrice.call({}, [deployed.MlnToken.address])
    await updateCanonicalPriceFeed(deployed, {
      [deployed.EthToken.address]: new BigNumber(10 ** 18),
      [deployed.MlnToken.address]: new BigNumber(mlnPrice).mul(4.78 * 10 ** 18).div(10 ** 18),
    });
    await registerFund(secondFund.address, deployer, buyInAmount);
    const secondFundMln = await deployed.MlnToken.instance.balanceOf.call({}, [
      fund.address,
    ]);
    const secondFundSupply = await secondFund.instance.totalSupply.call({}, []);

    t.deepEqual(fundMln, secondFundMln);
    t.deepEqual(fundMln, expectedReward);;
    t.true(fundSupply < secondFundSupply);
  },
);

test.serial("Cannot register after endTime", async t => {
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
      blockchainTime - 86400,
      10 ** 17,
      10 ** 22,
      10,
    ],
    () => {},
    true,
  );
  await competitionCompliance.instance.changeCompetitionAddress.postTransaction(
    opts,
    [competition.address],
  );
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [manager],
  ]);
  // Send some MLN to competition contract
  await deployed.MlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [competition.address, 10 ** 24, ""],
  );
  const registrantFund = await registerFund(fund.address, manager, 10);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test.serial("Cannot register before startTime", async t => {
  const blockchainTime = await getChainTime();
  competition = await deployContract(
    "competitions/Competition",
    Object.assign(opts, { gas: 6800000 }),
    [
      deployed.MlnToken.address,
      deployed.EurToken.address,
      version.address,
      accounts[5],
      blockchainTime - 86400,
      blockchainTime - 86400,
      10 ** 17,
      10 ** 22,
      10,
    ],
    () => {},
    true,
  );
  await competitionCompliance.instance.changeCompetitionAddress.postTransaction(
    opts,
    [competition.address],
  );
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [manager],
  ]);
  // Send some MLN to competition contract
  await deployed.MlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [competition.address, 10 ** 24, ""],
  );
  const registrantFund = await registerFund(fund.address, manager, 10);
  t.is(registrantFund, "0x0000000000000000000000000000000000000000");
});

test.serial(
  "Cannot register if max number of registrants is reached",
  async t => {
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
        10 ** 17,
        10 ** 22,
        0,
      ],
      () => {},
      true,
    );
    await competitionCompliance.instance.changeCompetitionAddress.postTransaction(
      opts,
      [competition.address],
    );
    await competition.instance.batchAddToWhitelist.postTransaction(opts, [
      10 ** 22,
      [manager],
    ]);
    // Send some MLN to competition contract
    await deployed.MlnToken.instance.transfer.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [competition.address, 10 ** 24, ""],
    );
    const registrantFund = await registerFund(fund.address, manager, 10);
    t.is(registrantFund, "0x0000000000000000000000000000000000000000");
  },
);
