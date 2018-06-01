import test from "ava";
import api from "../../utils/lib/api";
import {
  getTermsSignatureParameters,
  getSignatureParameters,
} from "../../utils/lib/signing";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";
import getAllBalances from "../../utils/lib/getAllBalances";
import getChainTime from "../../utils/lib/getChainTime";
import deployEnvironment from "../../utils/deploy/contracts";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const buyinValue = new BigNumber(0.5 * 10 ** 19);
const competitionDuration = 15; // Duration in seconds
const competitionTerms =
  "0x12208E21FD34B8B2409972D30326D840C9D747438A118580D6BA8C0735ED53810491";

let accounts;
let deployer;
let manager;
let opts;
let competition;
let competitionCompliance;
let version;
let deployed;
let fund;

const sleep = s => new Promise(resolve => setTimeout(resolve, s * 1000));

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
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

  // Get blockchain time
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
      blockchainTime + competitionDuration,
      22 * 10 ** 18,
      10 ** 23,
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
    10 ** 23,
    [manager],
  ]);

  // Fund setup by manager
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Suisse Fund",
      deployed.MlnToken.address, // base asset
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
});

test.serial("Registration leads to entry of the fund", async t => {
  await updateCanonicalPriceFeed(deployed);
  const [r, s, v] = await getSignatureParameters(manager, competitionTerms);
  await competition.instance.registerForCompetition.postTransaction(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
      value: buyinValue,
    },
    [fund.address, v, r, s],
  );
  const registrantFund = await competition.instance.getRegistrantFund.call({}, [
    manager,
  ]);
  t.is(registrantFund, fund.address);
});

test.serial(
  "Competition claimReward transfers shares to the registrant",
  async t => {
    // Shares of the registrant fund
    const pre = await getAllBalances(deployed, accounts, fund);
    const managerPreShares = await fund.instance.balanceOf.call({}, [manager]);
    const competitionPreShares = await fund.instance.balanceOf.call({}, [
      competition.address,
    ]);
    const fundPreSupply = await fund.instance.totalSupply.call({}, []);
    const timeTillEnd = await competition.instance.getTimeTillEnd.call({}, []);
    await sleep(Number(timeTillEnd) + 2);
    // Random transaction to mine block
    await api.eth.sendTransaction();
    await competition.instance.claimReward.postTransaction(
      {
        from: manager,
        gas: config.gas,
        gasPrice: config.gasPrice,
      },
      [],
    );
    // let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    const post = await getAllBalances(deployed, accounts, fund);
    const bonusRate = await competition.instance.bonusRate.call({}, []);
    const expectedShares = buyinValue.mul(bonusRate).div(10 ** 18);
    const managerPostShares = await fund.instance.balanceOf.call({}, [manager]);
    const competitionPostShares = await fund.instance.balanceOf.call({}, [
      competition.address,
    ]);
    const fundPostSupply = await fund.instance.totalSupply.call({}, []);
    t.deepEqual(managerPostShares, managerPreShares.add(expectedShares));
    t.deepEqual(
      competitionPostShares,
      competitionPreShares.sub(expectedShares),
    );
    t.deepEqual(fundPostSupply, fundPreSupply);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.custodian.MlnToken, pre.custodian.MlnToken);
    t.deepEqual(post.custodian.ether, pre.custodian.ether);
  },
);
