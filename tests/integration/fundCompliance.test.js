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
import { encodeArgs } from '~/tests/utils/formatting';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { getDeployed } from '~/tests/utils/getDeployed';

const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

let web3;
let deployer, manager, investor, badInvestor;
let defaultTxOpts, managerTxOpts, investorTxOpts, badInvestorTxOpts;
let fundFactory, priceSource;
let userWhitelist;
let mln, weth;
let buySharesFunctionSig;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

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

// TODO: we're changing how policies like this are deployed/managed shortly, so no
// need to fix this test right now
describe.skip('Fund 1: user whitelist', () => {
  let offeredValue, wantedShares;
  let mln, weth, priceSource, userWhitelist;
  let fund;

  beforeAll(async () => {
    userWhitelist = await deploy(
      CONTRACT_NAMES.USER_WHITELIST,
      [[investor]],
      defaultTxOpts,
      [],
      web3
    );

    mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
    weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
    priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);


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
