/*
 * @file Tests fund compliance policy rules in a real fund
 *
 * @test Fund policies are set
 * @test Whitelist policy prohibits un-whitelisted user from participating in fund
 * @test Whitelist policy allows whitelisted user to participate
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { deploy } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';

let deployer, manager, investor, badInvestor;
let defaultTxOpts, managerTxOpts, investorTxOpts, badInvestorTxOpts;
let requestInvestmentFunctionSig;

beforeAll(async () => {
  [deployer, manager, investor, badInvestor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  badInvestorTxOpts = { ...defaultTxOpts, from: badInvestor };

  requestInvestmentFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.PARTICIPATION,
    'requestInvestment',
  );
});

describe('Fund 1: user whitelist', () => {
  let amguAmount, offeredValue, wantedShares;
  let mln, weth, priceSource, userWhitelist;
  let fund;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;

    mln = contracts.MLN;
    weth = contracts.WETH;
    priceSource = contracts.TestingPriceFeed;
    const version = contracts.Version;

    userWhitelist = await deploy(CONTRACT_NAMES.USER_WHITELIST, [[investor]]);

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      manager,
      quoteToken: weth.options.address,
      version
    });

    await send(
      fund.policyManager,
      'register',
      [encodeFunctionSignature(requestInvestmentFunctionSig), userWhitelist.options.address],
      managerTxOpts
    );

    amguAmount = toWei('.01', 'ether');
    offeredValue = toWei('1', 'ether');
    wantedShares = toWei('1', 'ether');
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const requestInvestmentPoliciesRes = await call(
      policyManager,
      'getPoliciesBySig',
      [encodeFunctionSignature(requestInvestmentFunctionSig)],
    );
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

    await send(weth, 'transfer', [badInvestor, offeredValue], defaultTxOpts);

    await send(weth, 'approve', [participation.options.address, offeredValue], badInvestorTxOpts);
    await expect(
      send(
        participation,
        'requestInvestment',
        [wantedShares, offeredValue, weth.options.address],
        { ...badInvestorTxOpts, value: amguAmount }
      )
    ).rejects.toThrowFlexible("Rule evaluated to false: UserWhitelist");
  });

  test('Good request investment: user is whitelisted', async () => {
    const { participation, shares } = fund;

    await send(weth, 'transfer', [investor, offeredValue], defaultTxOpts);

    await send(weth, 'approve', [participation.options.address, offeredValue], investorTxOpts);
    await send(
      participation,
      'requestInvestment',
      [wantedShares, offeredValue, weth.options.address],
      { ...investorTxOpts, value: amguAmount }
    );

    // Need price update before participation executed
    await delay(1000);
    await send(
      priceSource,
      'update',
      [
        [weth.options.address, mln.options.address],
        [toWei('1', 'ether'), toWei('0.5', 'ether')],
      ],
      defaultTxOpts
    );

    await send(
      participation,
      'executeRequest',
      [],
      investorTxOpts
    );

    const investorShares = await call(shares, 'balanceOf', [investor]);
    expect(investorShares).toEqual(wantedShares);
  });
});
