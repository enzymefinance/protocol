/*
 * @file Tests fund compliance policy rules in a real fund
 *
 * @test Fund policies are set
 * @test Whitelist policy prohibits un-whitelisted user from participating in fund
 * @test Whitelist policy allows whitelisted user to participate
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import setupInvestedTestFund from '~/tests/utils/setupInvestedTestFund';

let deployer, manager, investor, badInvestor;
let defaultTxOpts, managerTxOpts, investorTxOpts, badInvestorTxOpts;
let requestInvestmentFunctionSig;
let mln, weth, priceSource, userWhitelist;
let fund;
let contracts;

beforeAll(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, badInvestor] = accounts;
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  badInvestorTxOpts = { ...defaultTxOpts, from: badInvestor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  priceSource = contracts.TestingPriceFeed;

  userWhitelist = await deploy(CONTRACT_NAMES.USER_WHITELIST, [[investor]]);

  requestInvestmentFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.PARTICIPATION,
    'requestInvestment',
  );

  await weth.methods.transfer(manager, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(investor, toWei('10', 'ether')).send(defaultTxOpts);
});

describe('Fund 1: user whitelist', () => {
  let amguAmount, offeredValue, wantedShares;

  beforeAll(async () => {
    fund = await setupInvestedTestFund(contracts, manager);

    await fund.policyManager.methods
      .register(
        encodeFunctionSignature(requestInvestmentFunctionSig),
        userWhitelist.options.address,
      )
      .send(managerTxOpts);

    amguAmount = toWei('.01', 'ether');
    offeredValue = toWei('1', 'ether');
    wantedShares = toWei('1', 'ether');
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const requestInvestmentPoliciesRes = await policyManager.methods
      .getPoliciesBySig(encodeFunctionSignature(requestInvestmentFunctionSig))
      .call();
    const requestInvestmentPolicyAddresses = [
      ...requestInvestmentPoliciesRes[0],
      ...requestInvestmentPoliciesRes[1]
    ];

    expect(
      requestInvestmentPolicyAddresses.includes(userWhitelist.options.address)
    ).toBe(true);
  });

  test('Bad request investment: user not on whitelist', async () => {
    const { participation } = fund;

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(badInvestorTxOpts);

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...badInvestorTxOpts, value: amguAmount }),
    ).rejects.toThrow('Rule evaluated to false: UserWhitelist');
  });

  test('Good request investment: user is whitelisted', async () => {
    const { participation, shares } = fund;

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);
    await participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    // Need price update before participation executed
    await increaseTime(1800);
    await priceSource.methods
      .update(
        [weth.options.address, mln.options.address],
        [toWei('1', 'ether'), toWei('0.5', 'ether')],
      ).send(defaultTxOpts);

    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const investorShares = await shares.methods.balanceOf(investor).call();

    expect(investorShares).toEqual(wantedShares);
  });
});
