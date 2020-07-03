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
  CALL_ON_INTEGRATION_ENCODING_TYPES,
  CONTRACT_NAMES,
  KYBER_ETH_ADDRESS,
} from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let defaultTxOpts, managerTxOpts;
let deployer, manager, investor;
let takeOrderSignature;
let fundFactory, kyberAdapter, kyberNetworkProxy, weth, mln, zrx;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, mainnetAddrs.kyber.KyberNetworkProxy);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.ZRX);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);

  fund = await setupFundWithParams({
    integrationAdapters: [kyberAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.KYBER_ADAPTER,
    'takeOrder'
  );
});

test('swap WETH for MLN with expected rate from kyberNetworkProxy', async () => {
  const { vault } = fund;

  const outgoingAsset = weth.options.address;
  const outgoingAssetAmount = toWei('0.1', 'ether');
  const incomingAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, incomingAsset, outgoingAssetAmount],
  );

  const expectedIncomingAssetAmount = BNExpMul(
    new BN(outgoingAssetAmount.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      expectedIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(outgoingAssetAmount));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(expectedIncomingAssetAmount));
});

test('swap MLN for WETH with expected rate from kyberNetworkProxy', async () => {
  const { vault } = fund;

  const outgoingAsset = mln.options.address;
  const outgoingAssetAmount = toWei('0.01', 'ether');
  const incomingAsset = weth.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, incomingAsset, outgoingAssetAmount],
  );

  const expectedIncomingAssetAmount = BNExpMul(
    new BN(outgoingAssetAmount.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      expectedIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = postFundBalanceOfWeth.sub(preFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = preFundBalanceOfMln.sub(postFundBalanceOfMln);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(expectedIncomingAssetAmount));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(outgoingAssetAmount));
});

test('swap MLN directly to ZRX without intermediary', async () => {
  const { vault } = fund;

  const outgoingAsset = mln.options.address;
  const outgoingAssetAmount = toWei('0.01', 'ether');
  const incomingAsset = zrx.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [outgoingAsset, incomingAsset, outgoingAssetAmount],
  );

  const expectedIncomingAssetAmount = BNExpMul(
    new BN(outgoingAssetAmount.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfEur = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      expectedIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfEur = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = preFundBalanceOfMln.sub(postFundBalanceOfMln);
  const fundBalanceOfEurDiff = postFundBalanceOfEur.sub(preFundBalanceOfEur);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfEurDiff).bigNumberEq(new BN(expectedIncomingAssetAmount));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(outgoingAssetAmount));
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(0));
});

test('swap fails if make quantity is too high', async () => {
  const { vault } = fund;

  const outgoingAsset = mln.options.address;
  const outgoingAssetAmount = toWei('0.01', 'ether');
  const incomingAsset = zrx.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [outgoingAsset, incomingAsset, outgoingAssetAmount],
  );

  const expectedIncomingAssetAmount = BNExpMul(
    new BN(outgoingAssetAmount.toString()),
    new BN(expectedRate.toString()),
  );
  const tooHighIncomingAssetAmount = expectedIncomingAssetAmount.add(new BN(1)).toString();

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      tooHighIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  await expect(
    send(
      vault,
      'callOnIntegration',
      [
        kyberAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    )
  ).rejects.toThrowFlexible("received incoming asset less than expected");
});
