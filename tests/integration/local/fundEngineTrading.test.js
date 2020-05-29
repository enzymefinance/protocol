/*
 * @file Tests a fund vault with the Melon Engine
 *
 * @test A fund can take an order once liquid ETH is thawed
 * @test The amount of WETH being asked for by the fund is respected as a minimum
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';
import { increaseTime } from '~/tests/utils/rpc';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getDeployed } from '~/tests/utils/getDeployed';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';

const mainnetAddrs = require('../../../mainnet_thirdparty_contracts');

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let engine, mln, fund, weth, engineAdapter, priceSource, priceTolerance;
let mlnPrice, makerQuantity, takerQuantity;
let takeOrderSignature, takeOrderSignatureBytes;
let mlnToEthRate;
let fundFactory;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  engine = getDeployed(CONTRACT_NAMES.ENGINE, web3);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  priceTolerance = getDeployed(CONTRACT_NAMES.PRICE_TOLERANCE, web3);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
  takeOrderSignatureBytes = encodeFunctionSignature(
    takeOrderSignature
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
  await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts, web3);

  fund = await setupFundWithParams({
    amguTxValue: toWei('10', 'ether'),
    defaultTokens: [mln.options.address, weth.options.address],
    integrationAdapters: [engineAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor: deployer,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
  });

  const { policyManager } = fund;

  await send(
    policyManager,
    'register',
    [takeOrderSignatureBytes, priceTolerance.options.address],
    managerTxOpts,
    web3
  );
});

test('Invest in fund with enough MLN to buy desired ETH from engine', async () => {
  const { hub, shares } = fund;

  const wantedShares = toWei('1', 'ether');
  const amguTxValue = toWei('10', 'ether');

  const costOfShares = await call(
    shares,
      'getSharesCostInAsset',
      [wantedShares, mln.options.address]
  );

  const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));

  await investInFund({
    fundAddress: hub.options.address,
    investment: {
      contribAmount: costOfShares,
      investor,
      tokenContract: mln
    },
    amguTxValue,
    tokenPriceData: {
      priceSource,
      tokenAddresses: [mln.options.address],
      tokenPrices: [mlnToEthRate]
    },
    web3
  });

  const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  expect(postInvestorShares).bigNumberEq(preInvestorShares.add(new BN(wantedShares)));
});

test('Trade on Melon Engine', async () => {
  const { vault } = fund;

  // Thaw frozen eth
  await increaseTime(86400 * 32, web3);
  await send(engine, 'thaw', [], defaultTxOpts, web3);

  const preliquidEther = new BN(await call(engine, 'liquidEther'));
  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );

  const makerAsset = weth.options.address;
  const takerAsset = mln.options.address;

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  });

  // get fresh price since we changed blocktime
  await updateKyberPriceFeed(priceSource, web3);

  await send(
    vault,
    'callOnIntegration',
    [
      engineAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
    web3
  );

  const postliquidEther = new BN(await call(engine, 'liquidEther'));
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

  expect(fundHoldingsWethDiff).bigNumberEq(postFundBalanceOfWeth.sub(preFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(preFundBalanceOfMln.sub(postFundBalanceOfMln));

  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundHoldingsWethDiff).bigNumberEq(preliquidEther.sub(postliquidEther));
});

test('Maker quantity as minimum returned WETH is respected', async () => {
  const { vault } = fund;

  const makerQuantity = new BN(mlnPrice.toString()).div(new BN(2)).toString();

  const makerAsset = weth.options.address;
  const takerAsset = mln.options.address;
  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  });

  await expect(
    send(
      vault,
      'callOnIntegration',
      [
        engineAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts,
      web3
    )
  ).rejects.toThrowFlexible(
    "validateAndEmitOrderFillResults: received less buy asset than expected"
  );
});
