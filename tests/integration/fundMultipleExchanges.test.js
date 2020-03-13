/*
 * @file Tests a fund vault with multiple exchange adapters
 *
 * @test A fund can add an exchange adapter after it is created
 * @test A fund can take an order with the newly-added exchange
 * @test TODO: multiple tests for take orders on multiple exchanges
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS, KYBER_ETH_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let takeOrderSignature;
let mln, weth;
let oasisDexExchange, oasisDexAdapter;
let kyberNetworkProxy, kyberAdapter, kyberExchangeIndex;
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
    fundFactory
  });
});

test("add Kyber to fund's allowed exchanges", async () => {
  const { vault } = fund;

  const preAddExchangeCount = (await call(vault, 'getExchangeInfo'))[0].length;

  await send(
    vault,
    'addExchange',
    [kyberNetworkProxy.options.address, kyberAdapter.options.address],
    managerTxOpts
  );

  const exchangeInfo = await call(vault, 'getExchangeInfo');
  kyberExchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === kyberAdapter.options.address.toLowerCase()
  );

  expect(kyberExchangeIndex).toBe(preAddExchangeCount);
});

test('fund takes an order on Kyber', async () => {
  const { accounting, vault } = fund;

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
    await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
  );

  const orderAddresses = [];
  const orderValues = [];

  orderAddresses[0] = makerAsset;
  orderAddresses[1] = takerAsset;
  orderValues[0] = makerQuantity;
  orderValues[1] = takerQuantity;

  const hex = web3.eth.abi.encodeParameters(
    ['address[2]', 'uint256[2]'],
    [orderAddresses, orderValues],
  );
  const encodedArgs = web3.utils.hexToBytes(hex);

  await send(
    vault,
    'callOnExchange',
    [
      kyberExchangeIndex,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
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
