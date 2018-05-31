import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters, getSignatureParameters } from "../../utils/lib/signing";
import { retrieveContract } from "../../utils/lib/contracts";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const competitionTerms =
  "0x12208E21FD34B8B2409972D30326D840C9D747438A118580D6BA8C0735ED53810491";

// hoisted variables
let accounts;
let deployer;
let fund;
let manager;
let mlnToken;
let version;
let competition;
let deployed;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager] = accounts;
  version = await deployed.Version;
  competition = await deployed.Competition;
  mlnToken = await deployed.MlnToken;
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Suisse Fund",
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
    const buyinValue = new BigNumber(0.78 * 10 ** 21);
    await updateCanonicalPriceFeed(deployed);
    const pre = await getAllBalances(deployed, accounts, fund);
    const preCompetitionMln = await mlnToken.instance.balanceOf.call({}, [
      competition.address,
    ]);
    const preTotalSupply = await fund.instance.totalSupply.call({}, []);
    const [r, s, v] = await getSignatureParameters(manager, competitionTerms);
    const estimatedMlnReward = await competition.instance.calculatePayout.call({}, [buyinValue]);
    const estimatedShares = await competition.instance.getEtherValue.call({}, [estimatedMlnReward]);
    await competition.instance.registerForCompetition.postTransaction(
      {
        from: manager,
        gas: config.gas,
        gasPrice: config.gasPrice,
        value: buyinValue,
      },
      [fund.address, v, r, s],
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const postCompetitionMln = await mlnToken.instance.balanceOf.call({}, [
      competition.address,
    ]);
    const postTotalSupply = await fund.instance.totalSupply.call({}, []);
    const registrantFund = await competition.instance.getRegistrantFund.call(
      {},
      [manager],
    );
    t.is(registrantFund, fund.address);
    t.is(Number(preTotalSupply), 0);
    t.deepEqual(post.custodian.ether, pre.custodian.ether.add(buyinValue));
    t.deepEqual(post.custodian.MlnToken, pre.custodian.MlnToken);
    // t.deepEqual(post.manager.ether, pre.manager.ether.sub(buyinValue));
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
    t.is(Number(post.fund.MlnToken), Number(pre.fund.MlnToken.add(estimatedMlnReward)));
    t.deepEqual(Number(postCompetitionMln), Number(preCompetitionMln.sub(estimatedMlnReward)));
    t.deepEqual(postTotalSupply, preTotalSupply.add(estimatedShares));

    // Verify registration parameters
    const registrantId = await competition.instance.getRegistrantId.call({}, [
      manager,
    ]);
    const registrationDetails = await competition.instance.registrants.call(
      {},
      [registrantId],
    );
    t.is(registrationDetails[0], fund.address);
    t.is(registrationDetails[1], manager);
    t.is(registrationDetails[2], true);
    t.deepEqual(registrationDetails[3], buyinValue);
    t.deepEqual(registrationDetails[4], estimatedMlnReward);
    t.is(registrationDetails[5], false);
  },
);
