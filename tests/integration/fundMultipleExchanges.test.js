/*
 * @file Tests a fund trading with multiple exchange adapters
 *
 * @test A fund can add an exchange adapter after it is created
 * @test A fund can take an order with the newly-added exchange
 * @test TODO: multiple tests for take orders on multiple exchanges
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS, KYBER_ETH_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let takeOrderFunctionSig;
let mln, weth;
let oasisDexExchange, oasisDexAdapter;
let kyberNetworkProxy, kyberAdapter, kyberExchangeIndex;
let version, fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );

  mln = contracts.MLN;
  version = contracts.Version;
  weth = contracts.WETH;

  oasisDexExchange = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;

  kyberNetworkProxy = contracts.KyberNetworkProxy;
  kyberAdapter = contracts.KyberAdapter;

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [oasisDexExchange.options.address],
    exchangeAdapters: [oasisDexAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    version
  });
});

test("add Kyber to fund's allowed exchanges", async () => {
  const { trading } = fund;

  const preAddExchangeCount = (await call(trading, 'getExchangeInfo'))[0].length;

  await send(
    trading,
    'addExchange',
    [kyberNetworkProxy.options.address, kyberAdapter.options.address],
    managerTxOpts
  );

  const exchangeInfo = await call(trading, 'getExchangeInfo');
  kyberExchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === kyberAdapter.options.address.toLowerCase()
  );

  expect(kyberExchangeIndex).toBe(preAddExchangeCount);
});

test('fund takes an order on Kyber', async () => {
  const { accounting, trading } = fund;

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

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );

  await send(
    trading,
    'callOnExchange',
    [
      kyberExchangeIndex,
      takeOrderFunctionSig,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        makerAsset,
        takerAsset,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0',
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
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
