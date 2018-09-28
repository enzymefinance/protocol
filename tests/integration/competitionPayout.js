import test from "ava";
import web3 from "../../utils/lib/web3";
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
const competitionDuration = 13; // Duration in seconds

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
  accounts = await web3.eth.getAccounts();
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
      "1",
      deployed.Governance.options.address,
      deployed.MlnToken.options.address,
      deployed.EthToken.options.address,
      deployed.CanonicalPriceFeed.options.address,
      competitionCompliance.options.address,
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
      deployed.MlnToken.options.address,
      version.options.address,
      accounts[5],
      blockchainTime,
      blockchainTime + competitionDuration,
      new BigNumber(22 * 10 ** 18),
      new BigNumber(10 ** 23),
      10
    ],
    () => {},
    true,
  );
  await competitionCompliance.methods.changeCompetitionAddress(competition.options.address).send(opts);
  await competition.methods.batchAddToWhitelist(new BigNumber(10 ** 23), [manager]).send(opts);

  // Fund setup by manager
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    web3.utils.toHex("Suisse Fund"),
    deployed.MlnToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.MatchingMarket.options.address],
    [deployed.MlnToken.options.address],
    v,
    r,
    s,
  ).send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);

  // Send some MLN to competition contract
  await deployed.MlnToken.methods.transfer(competition.options.address, new BigNumber(10 ** 24)).send({ from: deployer, gasPrice: config.gasPrice });
});

test.serial("Registration leads to entry of the fund", async t => {
  await updateCanonicalPriceFeed(deployed);
  const competitionTerms = await competition.methods.TERMS_AND_CONDITIONS().call();
  const [r, s, v] = await getSignatureParameters(manager, competitionTerms);
  await competition.methods.registerForCompetition(fund.options.address, v, r, s).send(
    {
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
      value: buyinValue,
    }
  );
  const registrantFund = await competition.methods.getRegistrantFund(manager).call();
  t.is(registrantFund, fund.options.address);
});

test.serial(
  "Competition claimReward transfers shares to the registrant",
  async t => {
    // Shares of the registrant fund
    const pre = await getAllBalances(deployed, accounts, fund);
    const managerPreShares = new BigNumber(await fund.methods.balanceOf(manager).call());
    const competitionPreShares = new BigNumber(await fund.methods.balanceOf(competition.options.address).call());
    const fundPreSupply = await fund.methods.totalSupply().call();
    const timeTillEnd = await competition.methods.getTimeTillEnd().call();
    await sleep(Number(timeTillEnd) + 2);
    // Random transaction to mine block
    await competition.methods.claimReward().send({
      from: manager,
      gas: config.gas,
      gasPrice: config.gasPrice,
    });
    // let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    const post = await getAllBalances(deployed, accounts, fund);
    const managerPostShares = new BigNumber(await fund.methods.balanceOf(manager).call());
    const competitionPostShares = new BigNumber(await fund.methods.balanceOf(competition.options.address).call());
    const fundPostSupply = await fund.methods.totalSupply().call();
    t.deepEqual(managerPostShares, managerPreShares.add(fundPreSupply));
    t.deepEqual(
      competitionPostShares,
      competitionPreShares.sub(fundPreSupply),
    );
    t.deepEqual(fundPostSupply, fundPreSupply);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.custodian.MlnToken, pre.custodian.MlnToken);
    t.deepEqual(post.custodian.ether, pre.custodian.ether);
  },
);
