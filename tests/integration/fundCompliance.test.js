/*
 * @file Tests fund compliance policy rules in a real fund
 *
 * @test Fund policies are set
 * @test Whitelist policy prohibits un-whitelisted user from participating in fund
 * @test Whitelist policy allows whitelisted user to participate
 */

import mainnetAddrs from '~/config';
import { BNExpDiv } from '~/utils/BNmath';
import { CONTRACT_NAMES } from '~/utils/constants';
import { call } from '~/utils/deploy-contract';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import { investInFund, setupFundWithParams } from '~/utils/fund';
import { toWei, BN } from 'web3-utils';

let manager, investor, badInvestor;
let fundFactory;

beforeAll(async () => {
  [, manager, investor, badInvestor] = await web3.eth.getAccounts();
});

describe('Fund 1: user whitelist', () => {
  let offeredValue;
  let weth, priceSource, userWhitelist;
  let fund;

  beforeAll(async () => {
    weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
    priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
    fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
    userWhitelist = getDeployed(CONTRACT_NAMES.USER_WHITELIST);

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

    const policies = await call(policyManager, 'getEnabledPolicies');
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
    });

    const investorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(investorShares).bigNumberEq(expectedShares);
  });
});
