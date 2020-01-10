/*
 * @file Tests funds trading via the Uniswap adapter
 *
 * @test Swap ERC20 for WETH (with minimum set from Uniswap price)
 * @test Swap WETH for ERC20 (with minimum set from Uniswap price)
 * @test Swap ERC20 for ERC20 (with no minimum set)
 * @test Swap fails if minimum is not met
 * @test TODO: make liquidity pools shadow pricefeed price and test price tolerance?
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { fetchContract } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import setupInvestedTestFund from '~/tests/utils/setupInvestedTestFund';

let deployer, manager;
let defaultTxOpts, managerTxOpts;
let contracts;
let eur, mln, weth, fund, uniswapAdapter;
let mlnExchange, eurExchange;
let takeOrderSignature;
let exchangeIndex;
let takerAddress;

beforeAll(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, manager] = accounts;

  const deployed = await partialRedeploy(
    [CONTRACT_NAMES.VERSION, CONTRACT_NAMES.UNISWAP_EXCHANGE]
  );
  contracts = deployed.contracts;

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );

  eur = contracts.EUR;
  mln = contracts.MLN;
  weth = contracts.WETH;
  uniswapAdapter = contracts.UniswapAdapter;

  // Seed manager with funds
  await weth.methods.transfer(manager, toWei('10', 'ether')).send(defaultTxOpts);

  // Set up fund with investment from manager
  fund = await setupInvestedTestFund(contracts, manager);

  // Set exchangeIndex for Uniswap
  const exchangeInfo = await fund.trading.methods.getExchangeInfo().call();
  exchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === uniswapAdapter.options.address.toLowerCase(),
  );

  takerAddress = fund.trading.options.address;

  // Load interfaces for uniswap exchanges of tokens to be traded
  const uniswapFactory = await fetchContract(
    "IUniswapFactory",
    contracts.UniswapFactory.options.address
  );
  const mlnExchangeAddress = await uniswapFactory.methods
    .getExchange(mln.options.address)
    .call();
  mlnExchange = await fetchContract(
    "IUniswapExchange",
    mlnExchangeAddress
  );
  const eurExchangeAddress = await uniswapFactory.methods
    .getExchange(eur.options.address)
    .call();
  eurExchange = await fetchContract(
    "IUniswapExchange",
    eurExchangeAddress
  );

  // Seed uniswap exchanges with liquidity
  const ethLiquidityAmount = toWei('10', 'ether');
  const eurLiquidityAmount = toWei('1000', 'ether');
  const mlnLiquidityAmount = toWei('20', 'ether');

  const minLiquidity = 0; // For first liquidity provider
  const deadline = (await web3.eth.getBlock('latest')).timestamp + 300 // Arbitrary

  await mln.methods
    .approve(mlnExchange.options.address, mlnLiquidityAmount)
    .send(defaultTxOpts);
  await mlnExchange.methods
    .addLiquidity(minLiquidity, mlnLiquidityAmount, deadline)
    .send({ ...defaultTxOpts, value: ethLiquidityAmount });

  await eur.methods
    .approve(eurExchange.options.address, eurLiquidityAmount)
    .send(defaultTxOpts);
  await eurExchange.methods
    .addLiquidity(minLiquidity, eurLiquidityAmount, deadline)
    .send({ ...defaultTxOpts, value: ethLiquidityAmount });
});

test('Swap WETH for MLN with minimum derived from Uniswap price', async () => {
  const { accounting, trading, vault } = fund;

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;

  const makerQuantity = await mlnExchange.methods
    .getEthToTokenInputPrice(takerQuantity)
    .call();

  const preMlnFundHoldings = new BN(
    await accounting.methods.assetHoldings(mln.options.address).call()
  );
  const preWethFundHoldings = new BN(
    await accounting.methods.assetHoldings(weth.options.address).call()
  );
  const preMlnVault = new BN(
    await mln.methods.balanceOf(vault.options.address).call()
  );

  await trading.methods
    .callOnExchange(
      exchangeIndex,
      takeOrderSignature,
      [
        EMPTY_ADDRESS,
        takerAddress,
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
    )
    .send(managerTxOpts);

  const postMlnFundHoldings = new BN(
    await accounting.methods.assetHoldings(mln.options.address).call()
  )
  const postWethFundHoldings = new BN(
    await accounting.methods.assetHoldings(weth.options.address).call()
  );
  const postMlnVault = new BN(
    await mln.methods.balanceOf(vault.options.address).call()
  );

  expect(postWethFundHoldings).bigNumberEq(
    preWethFundHoldings.sub(new BN(takerQuantity))
  );
  expect(postMlnFundHoldings).bigNumberEq(
    preMlnFundHoldings.add(new BN(makerQuantity))
  );
  expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(makerQuantity)));
});

test('Swap MLN for WETH with minimum derived from Uniswap price', async () => {
  const { accounting, trading, vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = weth.options.address;

  const makerQuantity = await mlnExchange.methods
    .getTokenToEthInputPrice(takerQuantity)
    .call();

  const preMlnFundHoldings = new BN(
    await accounting.methods.assetHoldings(mln.options.address).call()
  )
  const preWethFundHoldings = new BN(
    await accounting.methods.assetHoldings(weth.options.address).call()
  );
  const preWethVault = new BN(
    await weth.methods.balanceOf(vault.options.address).call()
  );

  await trading.methods
    .callOnExchange(
      exchangeIndex,
      takeOrderSignature,
      [
        EMPTY_ADDRESS,
        takerAddress,
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
    )
    .send(managerTxOpts);

  const postMlnFundHoldings = new BN(
    await accounting.methods.assetHoldings(mln.options.address).call()
  )
  const postWethFundHoldings = new BN(
    await accounting.methods.assetHoldings(weth.options.address).call()
  );
  const postWethVault = new BN(
    await weth.methods.balanceOf(vault.options.address).call()
  );

  expect(postWethFundHoldings).bigNumberEq(
    preWethFundHoldings.add(new BN(makerQuantity))
  );
  expect(postMlnFundHoldings).bigNumberEq(
    preMlnFundHoldings.sub(new BN(takerQuantity))
  );
  expect(postWethVault).bigNumberEq(preWethVault.add(new BN(makerQuantity)));
});

test('Swap MLN directly to EUR without specifying a minimum maker quantity', async () => {
  const { accounting, trading, vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = eur.options.address;
  const makerQuantity = "1";

  const intermediateEth = await mlnExchange.methods
    .getTokenToEthInputPrice(takerQuantity)
    .call();
  const expectedMakerQuantity = new BN(
    await eurExchange.methods.getEthToTokenInputPrice(intermediateEth).call()
  );

  const preEurFundHoldings = new BN(
    await accounting.methods.assetHoldings(eur.options.address).call()
  );
  const preMlnFundHoldings = new BN(
    await accounting.methods.assetHoldings(mln.options.address).call()
  )
  const preWethFundHoldings = new BN(
    await accounting.methods.assetHoldings(weth.options.address).call()
  );
  const preEurVault = new BN(
    await eur.methods.balanceOf(vault.options.address).call()
  );

  await trading.methods
    .callOnExchange(
      exchangeIndex,
      takeOrderSignature,
      [
        EMPTY_ADDRESS,
        takerAddress,
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
    )
    .send(managerTxOpts);

  const postEurFundHoldings = new BN(
    await accounting.methods.assetHoldings(eur.options.address).call()
  );
  const postMlnFundHoldings = new BN(
    await accounting.methods.assetHoldings(mln.options.address).call()
  )
  const postWethFundHoldings = new BN(
    await accounting.methods.assetHoldings(weth.options.address).call()
  );
  const postEurVault = new BN(
    await eur.methods.balanceOf(vault.options.address).call()
  );

  expect(postWethFundHoldings).bigNumberEq(preWethFundHoldings);
  expect(postMlnFundHoldings).bigNumberEq(
    preMlnFundHoldings.sub(new BN(takerQuantity))
  );
  expect(postEurFundHoldings).bigNumberEq(
    preEurFundHoldings.add(new BN(expectedMakerQuantity))
  );
  expect(postEurVault).bigNumberEq(preEurVault.add(new BN(expectedMakerQuantity)));
});

test('Order fails if maker amount is not satisfied', async () => {
  const { trading } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = weth.options.address;

  const makerQuantity = await mlnExchange.methods
    .getTokenToEthInputPrice(takerQuantity)
    .call();
  const highMakerQuantity = new BN(makerQuantity).mul(new BN(2)).toString();

  await expect(
    trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderSignature,
        [
          EMPTY_ADDRESS,
          takerAddress,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [highMakerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0',
      )
      .send(managerTxOpts)
  ).rejects.toThrow();
});
