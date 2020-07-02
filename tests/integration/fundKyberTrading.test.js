/*
 * @file Tests funds vault via the Kyber adapter
 *
 * @test Fund takes a MLN order with WETH using KyberNetworkProxy's expected price
 * @test Fund takes a WETH order with MLN using KyberNetworkProxy's expected price
 * @test Fund takes a EUR order with MLN without intermediary options specified
 * @test Fund take order fails with too high maker quantity
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpMul } from '~/utils/BNmath';
import {
  CONTRACT_NAMES,
  KYBER_ETH_ADDRESS,
} from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeTakeOrderArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let defaultTxOpts, managerTxOpts;
let deployer, manager, investor;
let takeOrderSignature;
let fundFactory, kyberAdapter, kyberNetworkProxy, weth, mln, zrx;
let fund;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, web3, mainnetAddrs.kyber.KyberNetworkProxy);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.ZRX);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);

  fund = await setupFundWithParams({
    integrationAdapters: [kyberAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
  });

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );
});

test('swap WETH for MLN with expected rate from kyberNetworkProxy', async () => {
  const { vault } = fund;

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, makerAsset, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  }, web3);

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
    web3
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerQuantity));
});

test('swap MLN for WETH with expected rate from kyberNetworkProxy', async () => {
  const { vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = weth.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [takerAsset, KYBER_ETH_ADDRESS, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  }, web3);

  // XXX: this errors with a revert, but no revert message
  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
    web3
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = postFundBalanceOfWeth.sub(preFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = preFundBalanceOfMln.sub(postFundBalanceOfMln);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(makerQuantity));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(takerQuantity));
});

test('swap MLN directly to EUR without intermediary', async () => {
  const { vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = zrx.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [takerAsset, makerAsset, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfEur = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  }, web3);

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
    web3
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfEur = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = preFundBalanceOfMln.sub(postFundBalanceOfMln);
  const fundBalanceOfEurDiff = postFundBalanceOfEur.sub(preFundBalanceOfEur);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfEurDiff).bigNumberEq(new BN(makerQuantity));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(0));
});

test('swap fails if make quantity is too high', async () => {
  const { vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = zrx.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [takerAsset, makerAsset, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()).mul(new BN(2)),
  ).toString();

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  }, web3);

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
  ).rejects.toThrowFlexible("received less buy asset than expected");
});
