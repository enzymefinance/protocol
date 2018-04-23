import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters, getSignatureParameters } from "../../utils/lib/signing";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const competitionTerms =
  "0x1A46B45CC849E26BB3159298C3C218EF300D015ED3E23495E77F0E529CE9F69E";

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let investor;
let manager;
let mlnToken;
let version;
let competition;
let deployed;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor] = accounts;
  version = await deployed.Version;
  competition = await deployed.Competition;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
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
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
});

const initialTokenAmount = new BigNumber(10 ** 24);
test.serial(
  "competition contract receives initial mlnToken for testing",
  async t => {
    const preDeployerMln = await mlnToken.instance.balanceOf.call({}, [
      deployer,
    ]);
    const preCompetitionMln = await mlnToken.instance.balanceOf.call({}, [
      competition.address,
    ]);
    await mlnToken.instance.transfer.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [competition.address, initialTokenAmount, ""],
    );
    const postDeployerMln = await mlnToken.instance.balanceOf.call({}, [
      deployer,
    ]);
    const postCompetitionMln = await mlnToken.instance.balanceOf.call({}, [
      competition.address,
    ]);

    t.deepEqual(postDeployerMln, preDeployerMln.sub(initialTokenAmount));
    t.deepEqual(postCompetitionMln, preCompetitionMln.add(initialTokenAmount));
  },
);

test.serial(
  "Competition registration takes input value of Ether from the registrant and transfers to custodian, deposits corresponding reward amount of MLN into their fund",
  async t => {
    const buyinValue = new BigNumber(0.5 * 10 ** 20);
    await updateCanonicalPriceFeed(deployed);
    const pre = await getAllBalances(deployed, accounts, fund);
    const preCompetitionMln = await mlnToken.instance.balanceOf.call({}, [competition.address,]);
    const preTotalSupply = await fund.instance.totalSupply.call({}, []);
    const [r, s, v] = await getSignatureParameters(manager, competitionTerms);
    const buyinRate  = await competition.instance.buyinRate.call({}, []);
    await competition.instance.registerForCompetition.postTransaction(
      { from: manager, gas: config.gas, gasPrice: config.gasPrice, value: buyinValue },
      [fund.address, v, r, s],
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const postCompetitionMln = await mlnToken.instance.balanceOf.call({}, [competition.address,]);
    const postTotalSupply = await fund.instance.totalSupply.call({}, []);
    const estimatedMlnReward = buyinValue.mul(buyinRate).div(10 ** 18);
    const registrantFund = await competition.instance.getRegistrantFund.call(
      {},
      [manager],
    );
    t.is(registrantFund, fund.address);
    t.is(Number(preTotalSupply), 0);
    t.deepEqual(post.custodian.ether, pre.custodian.ether.add(buyinValue));
    // t.deepEqual(post.manager.ether, pre.manager.ether.sub(buyinValue));
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(estimatedMlnReward));
    t.deepEqual(postCompetitionMln, preCompetitionMln.sub(estimatedMlnReward));
    t.deepEqual(postTotalSupply, preTotalSupply.add(estimatedMlnReward));

  },
);
