/*
 * @file Tests a fund vault with the Melon Engine
 *
 * @test A fund can take an order once liquid ETH is thawed
 * @test The amount of WETH being asked for by the fund is respected as a minimum
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';
import { increaseTime } from '~/tests/utils/rpc';
import { setupInvestedTestFund } from '~/tests/utils/fund';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, manager;
let defaultTxOpts, managerTxOpts;
let engine, mln, fund, weth, engineAdapter, kyberAdapter, priceSource;
let mlnPrice, makerQuantity, takerQuantity;
let takeOrderSignature;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  engine = getDeployed(CONTRACT_NAMES.ENGINE, web3);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
  mlnPrice = (await priceSource.methods
    .getCanonicalRate(mln.options.address, weth.options.address)
    .call())[0];
  takerQuantity = toWei('0.001', 'ether'); // Mln sell qty
  makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(mlnPrice.toString()),
  ).toString();
});

test('Setup a fund with amgu charged to seed Melon Engine', async () => {
  await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts, web3);

  // TODO: Need to calculate this in fund.js
  const amguTxValue = toWei('10', 'ether');
  fund = await setupInvestedTestFund(mainnetAddrs, manager, amguTxValue, web3);
});

test('Take an order for MLN on Kyber (in order to take ETH from Engine)', async () => {
  const { vault } = fund;

  const minMakerQuantity = toWei('0.1', 'ether');
  const encodedArgs = encodeTakeOrderArgs({
    makerAsset: mln.options.address,
    makerQuantity: minMakerQuantity,
    takerAsset: weth.options.address,
    takerQuantity: toWei('0.1', 'ether'),
  });

  await expect(
    send(
      vault,
      'callOnIntegration',
      [
        kyberAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts,
      web3
    )
  ).resolves.not.toThrow()
});

test('Trade on Melon Engine', async () => {
  const { vault } = fund;

  // Thaw frozen eth
  await increaseTime(86400 * 32, web3);
  await send(engine, 'thaw', [], defaultTxOpts, web3);

  const preLiquidEther = new BN(await call(engine, 'liquidEther'));
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

  const postLiquidEther = new BN(await call(engine, 'liquidEther'));
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
  expect(fundHoldingsWethDiff).bigNumberEq(preLiquidEther.sub(postLiquidEther));
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
