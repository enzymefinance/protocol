/*
 * @file Tests a fund vault with multiple integration adapters
 *
 * @test A fund can add an integration adapter after it is created
 * @test A fund can take an order with the newly-added integration
 * @test TODO: multiple tests for take orders on multiple integrations
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS, KYBER_ETH_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let takeOrderSignature;
let mln, weth;
let oasisDexExchange, oasisDexAdapter;
let kyberNetworkProxy, kyberAdapter;
let fundFactory, fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = contracts.MLN;
  fundFactory = contracts.FundFactory;
  weth = contracts.WETH;

  oasisDexExchange = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;

  kyberNetworkProxy = contracts.KyberNetworkProxy;
  kyberAdapter = contracts.KyberAdapter;

  fund = await setupFundWithParams({
    integrationAdapters: [oasisDexAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });
});

test("add Kyber to fund's enabled integrations", async () => {
  const { vault } = fund;

  const preAddIntegrations = await call(vault, 'getEnabledAdapters');
  expect(preAddIntegrations).not.toContain(kyberAdapter.options.address);

  await send(
    vault,
    'enableAdapters',
    [[kyberAdapter.options.address]],
    managerTxOpts
  );

  const postAddIntegrations = await call(vault, 'getEnabledAdapters');

  expect(postAddIntegrations.length).toBe(preAddIntegrations.length + 1);
  expect(postAddIntegrations).toContain(kyberAdapter.options.address);
});

test('fund takes an order on Kyber', async () => {
  const { vault } = fund;

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, makerAsset, takerQuantity],
    defaultTxOpts
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  });

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );

  const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
  const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
  expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));

  // Confirm that expected asset amounts were filled
  expect(fundHoldingsWethDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(makerQuantity));
});
