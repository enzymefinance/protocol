import test from "ava";
import web3 from "../../../utils/lib/web3";
import deployEnvironment from "../../../utils/deploy/contracts";
import {getTermsSignatureParameters} from "../../../utils/lib/signing";
import {deployContract, retrieveContract} from "../../../utils/lib/contracts";

const environment = "development";

// hoisted variables TODO: replace with t.context object
let deployer;
let manager;
let investor;
let version;
let fund;
let compliance;
let deployed;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  const accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  compliance = await deployContract("compliance/OnlyManager", {from: deployer, gas: 6000000});
  version = deployed.Version;
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    web3.utils.asciiToHex('Some Fund'),
    deployed.MlnToken.options.address,
    0,
    0,
    compliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.MatchingMarket.options.address],
    [],
    v,
    r,
    s
  ).send({from: manager, gas: 6000000});
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition address to manager just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods.changeCompetitionAddress(manager).send({from: deployer});
});

test("Manager can request investment", async t => {
  const receipt = await fund.methods.requestInvestment(
    100, 100, deployed.EthToken.options.address
  ).send({from: manager, gas: 6000000});
  const requestId = receipt.events.RequestUpdated.returnValues.id;
  const request = await fund.methods.requests(requestId).call();

  t.is(request[0], manager);
  t.not(Number(request[6]), 0);
});

test("Someone who is not manager can not request investment", async t => {
  await t.throws(
    fund.methods.requestInvestment(
      100, 100, deployed.EthToken.options.address
    ).send({from: investor, gas: 6000000})
  )
});

test("Anyone can perform redemption", async t => {
  const managerPermitted = await compliance.methods.isRedemptionPermitted(manager, 100, 100).call();
  const investorPermitted = await compliance.methods.isRedemptionPermitted(investor, 100, 100).call();

  t.true(managerPermitted);
  t.true(investorPermitted);
});
