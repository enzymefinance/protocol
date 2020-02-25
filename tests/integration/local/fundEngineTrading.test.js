/*
 * @file Tests a fund trading with the Melon Engine
 *
 * @test A fund can take an order once liquid ETH is thawed
 * @test The amount of WETH being asked for by the fund is respected as a minimum
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';

import web3 from '~/deploy/utils/get-web3';
import { BNExpMul } from '~/tests/utils/BNmath';
import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
} from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import { setupInvestedTestFund } from '~/tests/utils/fund';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let engine, mln, fund, weth, engineAdapter, priceSource, priceTolerance;
let contracts;
let exchangeIndex, mlnPrice, makerQuantity, takerQuantity;
let takeOrderSignature, takeOrderSignatureBytes;
let mlnToEthRate, wethToEthRate;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION, CONTRACT_NAMES.ENGINE]);
  contracts = deployed.contracts;
  engine = contracts.Engine;
  engineAdapter = contracts.EngineAdapter;
  priceSource = contracts.TestingPriceFeed;
  priceTolerance = contracts.PriceTolerance;
  mln = contracts.MLN;
  weth = contracts.WETH;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
  takeOrderSignatureBytes = encodeFunctionSignature(
    takeOrderSignature
  );

  // Set initial prices to be predictably the same as prices when updated again later
  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address],
      [wethToEthRate, mlnToEthRate],
    ],
    defaultTxOpts
  );

  mlnPrice = (await priceSource.methods
    .getPrice(mln.options.address)
    .call())[0];
  takerQuantity = toWei('0.001', 'ether'); // Mln sell qty
  makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(mlnPrice.toString()),
  ).toString();
});

test('Setup a fund with amgu charged to seed Melon Engine', async () => {
  await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

  // TODO: Need to calculate this in fund.js
  const amguTxValue = toWei('10', 'ether');
  fund = await setupInvestedTestFund(contracts, manager, amguTxValue);
  const { policyManager, trading } = fund;

  await send(
    policyManager,
    'register',
    [takeOrderSignatureBytes, priceTolerance.options.address],
    managerTxOpts
  );

  const exchangeInfo = await call(trading, 'getExchangeInfo');
  exchangeIndex = exchangeInfo[1].findIndex(
    e =>
      e.toLowerCase() ===
      engineAdapter.options.address.toLowerCase(),
  );
});

test('Invest in fund with enough MLN to buy desired ETH from engine', async () => {
  const { accounting, participation, shares } = fund;

  // Enable investment with mln
  await send(participation, 'enableInvestment', [[mln.options.address]], managerTxOpts);

  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('10', 'ether');

  const costOfShares = await call(
      accounting,
      'getShareCostInAsset',
      [wantedShares, mln.options.address]
  );

  const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));

  await send(mln, 'transfer', [investor, costOfShares], defaultTxOpts);
  await send(
    mln,
    'approve',
    [participation.options.address, toWei('100', 'ether')],
    investorTxOpts
  );
  await send(
    participation,
    'requestInvestment',
    [wantedShares, costOfShares, mln.options.address],
    { ...investorTxOpts, value: amguAmount }
  );

  // Need price update before participation executed
  await increaseTime(2);
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address],
      [wethToEthRate, mlnToEthRate],
    ],
    defaultTxOpts
  );
  await send(
    participation,
    'executeRequestFor',
    [investor],
    { ...investorTxOpts, value: amguAmount }
  );

  const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  expect(postInvestorShares).bigNumberEq(preInvestorShares.add(new BN(wantedShares)));
});

// TODO: fix failure due to web3 2.0 RPC interface (see increaseTime.js)
test('Trade on Melon Engine', async () => {
  const { accounting, trading } = fund;

  // Thaw frozen eth
  await increaseTime(86400 * 32);
  await send(engine, 'thaw');

  const preliquidEther = new BN(await call(engine, 'liquidEther'));
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
      exchangeIndex,
      takeOrderSignature,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        weth.options.address,
        mln.options.address,
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

  const postliquidEther = new BN(await call(engine, 'liquidEther'));
  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );

  const fundHoldingsWethDiff = postFundHoldingsWeth.sub(preFundHoldingsWeth);
  const fundHoldingsMlnDiff = preFundHoldingsMln.sub(postFundHoldingsMln);

  expect(fundHoldingsWethDiff).bigNumberEq(postFundBalanceOfWeth.sub(preFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(preFundBalanceOfMln.sub(postFundBalanceOfMln));

  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundHoldingsWethDiff).bigNumberEq(preliquidEther.sub(postliquidEther));
});

test('Maker quantity as minimum returned WETH is respected', async () => {
  const { trading } = fund;

  const makerQuantity = new BN(mlnPrice.toString()).div(new BN(2)).toString();

  await expect(
    send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
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
    )
  ).rejects.toThrowFlexible(
    "validateAndEmitOrderFillResults: received less buy asset than expected"
  );
});
