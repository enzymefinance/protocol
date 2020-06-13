/*
 * @file Tests funds vault via the Uniswap adapter
 *
 * @test Swap ERC20 for WETH (with minimum set from Uniswap price)
 * @test Swap WETH for ERC20 (with minimum set from Uniswap price)
 * @test Swap ERC20 for ERC20 (with no minimum set)
 * @test Swap fails if minimum is not met
 * @test TODO: make liquidity pools shadow pricefeed price and test price tolerance?
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, fetchContract, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let contracts;
let eur, mln, weth, fund;
let mlnExchange, eurExchange;
let takeOrderSignature;
let uniswapAdapter;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy(
    [CONTRACT_NAMES.FUND_FACTORY, CONTRACT_NAMES.UNISWAP_EXCHANGE]
  );
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  eur = contracts.EUR;
  mln = contracts.MLN;
  weth = contracts.WETH;
  const fundFactory = contracts.FundFactory;

  const uniswapFactory = contracts.UniswapFactory;
  uniswapAdapter = contracts.UniswapAdapter;

  fund = await setupFundWithParams({
    integrationAdapters: [uniswapAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });

  // Load interfaces for uniswap exchanges of tokens to be traded
  const iUniswapFactory = await fetchContract(
    "IUniswapFactory",
    contracts.UniswapFactory.options.address
  );
  const mlnExchangeAddress = await call(iUniswapFactory, 'getExchange', [mln.options.address]);
  mlnExchange = await fetchContract(
    "IUniswapExchange",
    mlnExchangeAddress
  );
  const eurExchangeAddress = await call(uniswapFactory, 'getExchange', [eur.options.address]);
  eurExchange = await fetchContract(
    "IUniswapExchange",
    eurExchangeAddress
  );

  // Seed uniswap exchanges with liquidity
  const ethLiquidityAmount = toWei('1', 'ether');
  const eurLiquidityAmount = toWei('100', 'ether');
  const mlnLiquidityAmount = toWei('2', 'ether');

  const minLiquidity = 0; // For first liquidity provider
  const deadline = (await web3.eth.getBlock('latest')).timestamp + 300 // Arbitrary

  await send(
    mln,
    'approve',
    [mlnExchange.options.address, mlnLiquidityAmount],
    defaultTxOpts
  );
  await send(
    mlnExchange,
    'addLiquidity',
    [minLiquidity, mlnLiquidityAmount, deadline],
    { ...defaultTxOpts, value: ethLiquidityAmount }
  );

  await send(
    eur,
    'approve',
    [eurExchange.options.address, eurLiquidityAmount],
    defaultTxOpts
  );
  await send(
    eurExchange,
    'addLiquidity',
    [minLiquidity, eurLiquidityAmount, deadline],
    { ...defaultTxOpts, value: ethLiquidityAmount }
  );

});

test('Swap WETH for MLN with minimum derived from Uniswap price', async () => {
  const { vault } = fund;

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;
  const makerQuantity = await call(
    mlnExchange,
    'getEthToTokenInputPrice',
    [takerQuantity]
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
      uniswapAdapter.options.address,
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

test('Swap MLN for WETH with minimum derived from Uniswap price', async () => {
  const { vault } = fund;

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = weth.options.address;
  const makerQuantity = await call(
    mlnExchange,
    'getTokenToEthInputPrice',
    [takerQuantity]
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
      uniswapAdapter.options.address,
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

  const fundHoldingsWethDiff = postFundHoldingsWeth.sub(preFundHoldingsWeth);
  const fundHoldingsMlnDiff = preFundHoldingsMln.sub(postFundHoldingsMln);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
  expect(fundHoldingsWethDiff).bigNumberEq(postFundBalanceOfWeth.sub(preFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(preFundBalanceOfMln.sub(postFundBalanceOfMln));

  // Confirm that expected asset amounts were filled
  expect(fundHoldingsWethDiff).bigNumberEq(new BN(makerQuantity));
  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(takerQuantity));
});

test('Swap MLN directly to EUR without specifying a minimum maker quantity', async () => {
  const { vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = eur.options.address;
  const makerQuantity = "1";

  const intermediateEth = await call(
    mlnExchange,
    'getTokenToEthInputPrice',
    [takerQuantity]
  );
  const expectedMakerQuantity = await call(
    eurExchange,
    'getEthToTokenInputPrice',
    [intermediateEth]
  );

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfEur = new BN(await call(eur, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );
  const preFundHoldingsEur = new BN(
    await call(vault, 'assetBalances', [eur.options.address])
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
      uniswapAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfEur = new BN(await call(eur, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );
  const postFundHoldingsEur = new BN(
    await call(vault, 'assetBalances', [eur.options.address])
  );

  const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
  const fundHoldingsMlnDiff = preFundHoldingsMln.sub(postFundHoldingsMln);
  const fundHoldingsEurDiff = postFundHoldingsEur.sub(preFundHoldingsEur);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
  expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(preFundBalanceOfMln.sub(postFundBalanceOfMln));
  expect(fundHoldingsEurDiff).bigNumberEq(postFundBalanceOfEur.sub(preFundBalanceOfEur));

  // Confirm that expected asset amounts were filled
  expect(fundHoldingsEurDiff).bigNumberEq(new BN(expectedMakerQuantity));
  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundHoldingsWethDiff).bigNumberEq(new BN(0));
});

test('Order fails if maker amount is not satisfied', async () => {
  const { vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = weth.options.address;
  const makerQuantity = await call(
    mlnExchange,
    'getTokenToEthInputPrice',
    [takerQuantity]
  );
  const highMakerQuantity = new BN(makerQuantity).mul(new BN(2)).toString();

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity: highMakerQuantity,
    takerAsset,
    takerQuantity,
  });

  await expect(
    send(
      vault,
      'callOnIntegration',
      [
        uniswapAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts,
    )
  ).rejects.toThrow(); // No specific message, fails at Uniswap level
});
