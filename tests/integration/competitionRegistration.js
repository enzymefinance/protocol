import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters, getSignatureParameters } from "../../utils/lib/signing";
import { retrieveContract } from "../../utils/lib/contracts";
import { updateKyberPriceFeed } from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

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
  accounts = await web3.eth.getAccounts();
  [deployer, manager] = accounts;
  version = await deployed.Version;
  competition = await deployed.Competition;
  mlnToken = await deployed.MlnToken;
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    web3.utils.toHex("Suisse Fund"),
    deployed.EthToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.MatchingMarket.options.address],
    [deployed.MlnToken.options.address],
    v,
    r,
    s,
  ).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice }
  );
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
});

const initialTokenAmount = new BigNumber(10 ** 24);
test.serial(
  "competition contract receives initial mlnToken for testing",
  async t => {
    const preDeployerMln = new BigNumber(await mlnToken.methods.balanceOf(
      deployer,
    ).call());
    const preCompetitionMln = new BigNumber(await mlnToken.methods.balanceOf(
      competition.options.address,
    ).call());
    await mlnToken.methods.transfer(competition.options.address, initialTokenAmount).send(
      { from: deployer, gasPrice: config.gasPrice }
    );
    const postDeployerMln = new BigNumber(await mlnToken.methods.balanceOf(
      deployer,
    ).call());
    const postCompetitionMln = new BigNumber(await mlnToken.methods.balanceOf(
      competition.options.address,
    ).call());

    t.deepEqual(postDeployerMln, preDeployerMln.sub(initialTokenAmount));
    t.deepEqual(postCompetitionMln, preCompetitionMln.add(initialTokenAmount));
  },
);

test.serial(
  "Competition registration takes input value of Ether from the registrant and transfers to custodian, deposits corresponding reward amount of MLN into their fund",
  async t => {
    const buyinValue = new BigNumber(0.78 * 10 ** 21);
    await updateKyberPriceFeed(deployed);
    const pre = await getAllBalances(deployed, accounts, fund);
    const preCompetitionMln = new BigNumber(await mlnToken.methods.balanceOf(
      competition.options.address,
    ).call());
    const preTotalSupply = new BigNumber(await fund.methods.totalSupply().call());
    const competitionTerms = competition.methods.TERMS_AND_CONDITIONS().call();
    const [r, s, v] = await getSignatureParameters(manager, competitionTerms);
    const estimatedMlnReward = await competition.methods.calculatePayout(buyinValue).call();
    const estimatedShares = await competition.methods.getEtherValue(estimatedMlnReward).call();
    await competition.methods.registerForCompetition(fund.options.address, v, r, s).send(
      {
        from: manager,
        gas: config.gas,
        gasPrice: config.gasPrice,
        value: buyinValue,
      }
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const postCompetitionMln = new BigNumber(await mlnToken.methods.balanceOf(
      competition.options.address,
    ).call());
    const postTotalSupply = new BigNumber(await fund.methods.totalSupply().call());
    const registrantFund = await competition.methods.getRegistrantFund(manager).call();
    t.is(registrantFund, fund.options.address);
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
    const registrantId = await competition.methods.getRegistrantId(
      manager,
    ).call();
    const registrationDetails = await competition.methods.registrants(registrantId).call();
    t.is(registrationDetails[0], fund.options.address);
    t.is(registrationDetails[1], manager);
    t.is(registrationDetails[2], true);
    t.deepEqual(Number(registrationDetails[3]), Number(buyinValue));
    t.deepEqual(Number(registrationDetails[4]), Number(estimatedMlnReward));
    t.is(registrationDetails[5], false);
  },
);
