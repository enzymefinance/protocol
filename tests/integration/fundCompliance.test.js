/*
 * @file Tests fund compliance policy rules in a real fund
 *
 * @test Fund policies are set
 * @test Whitelist policy prohibits un-whitelisted user from participating in fund
 * @test Whitelist policy allows whitelisted user to participate
 */

import { BN, toWei } from 'web3-utils';
import { call } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';

import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { encodeArgs } from '~/tests/utils/formatting';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer, manager, investor, badInvestor;
let defaultTxOpts, managerTxOpts, investorTxOpts, badInvestorTxOpts;
let fundFactory, priceSource;
let userWhitelist;
let mln, weth;
let buySharesFunctionSig;

beforeAll(async () => {
  [deployer, manager, investor, badInvestor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  badInvestorTxOpts = { ...defaultTxOpts, from: badInvestor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  priceSource = contracts.TestingPriceFeed;
  fundFactory = contracts.FundFactory;
  userWhitelist = contracts.UserWhitelist;

  buySharesFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.SHARES,
    'buyShares',
  );
});

describe('Fund 1: user whitelist', () => {
  let offeredValue;
  let fund;

  beforeAll(async () => {
    const policies = {
      addresses: [userWhitelist.options.address],
      encodedSettings: [
        encodeArgs(['address[]'], [[manager, investor]])
      ]
    };
    fund = await setupFundWithParams({
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      manager,
      policies: {
        addresses: policies.addresses,
        encodedSettings: policies.encodedSettings
      },
      quoteToken: weth.options.address,
      fundFactory
    });

    // Investment params
    offeredValue = toWei('1', 'ether');
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const policies = await call (policyManager, 'getEnabledPolicies');
    expect(policies).toContain(userWhitelist.options.address);
  });

  test('Bad request investment: user not on whitelist', async () => {
    const { hub } = fund;

    await expect(
      investInFund({
        fundAddress: hub.options.address,
        investment: {
          contribAmount: offeredValue,
          investor: badInvestor,
          tokenContract: weth
        },
        tokenPriceData: {
          priceSource,
          tokenAddresses: [weth.options.address],
          tokenPrices: [toWei('1', 'ether')]
        }
      })
    ).rejects.toThrowFlexible("Rule evaluated to false: USER_WHITELIST");
  });

  test('Good request investment: user is whitelisted', async () => {
    const { hub, shares } = fund;

    const sharePrice = new BN(await call(shares, 'calcSharePrice'));
    const expectedShares = BNExpDiv(new BN(offeredValue), sharePrice);

    await investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount: offeredValue,
        investor,
        tokenContract: weth
      },
      tokenPriceData: {
        priceSource,
        tokenAddresses: [weth.options.address],
        tokenPrices: [toWei('1', 'ether')]
      }
    })

    const investorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(investorShares).bigNumberEq(expectedShares);
  });
});
