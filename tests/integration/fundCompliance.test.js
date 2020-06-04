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
import { deploy } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { getDeployed } from '~/tests/utils/getDeployed';

const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

let web3;
let deployer, manager, investor, badInvestor;
let defaultTxOpts, managerTxOpts;
let buySharesFunctionSig;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  buySharesFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.SHARES,
    'buyShares',
  );
});


// TODO: re-enable when we have global policy deployments
describe.skip('Fund 1: user whitelist', () => {
  let offeredValue, wantedShares;
  let mln, weth, priceSource, userWhitelist;
  let fund;

  beforeAll(async () => {
    mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
    weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
    priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    console.log(defaultTxOpts)
    userWhitelist = await deploy(
      CONTRACT_NAMES.USER_WHITELIST,
      [[investor]],
      defaultTxOpts,
      [],
      web3
    );

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      manager,
      quoteToken: weth.options.address,
      fundFactory,
      web3
    });

    await send(
      fund.policyManager,
      'register',
      [encodeFunctionSignature(buySharesFunctionSig), userWhitelist.options.address],
      managerTxOpts,
      web3
    );

    // Investment params
    wantedShares = toWei('1', 'ether');
    offeredValue = await call(
      fund.shares,
      'getSharesCostInAsset',
      [wantedShares, weth.options.address]
    );
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const buySharesPoliciesRes = await call(
      policyManager,
      'getPoliciesBySig',
      [encodeFunctionSignature(buySharesFunctionSig)],
    );
    const buySharesPolicyAddresses = [
      ...buySharesPoliciesRes[0],
      ...buySharesPoliciesRes[1]
    ];

    expect(
      buySharesPolicyAddresses.includes(userWhitelist.options.address)
    ).toBe(true);
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
    ).rejects.toThrowFlexible("Rule evaluated to false: UserWhitelist");
  });

  test('Good request investment: user is whitelisted', async () => {
    const { hub, shares } = fund;

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

    const investorShares = await call(shares, 'balanceOf', [investor]);
    expect(investorShares).toEqual(wantedShares);
  });
});
