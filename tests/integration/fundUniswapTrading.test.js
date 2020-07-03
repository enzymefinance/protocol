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
import { call, send } from '~/utils/deploy-contract';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let zrx, mln, weth, fund;
let mlnExchange, zrxExchange;
let takeOrderSignature;
let uniswapAdapter;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.UNISWAP_ADAPTER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.ZRX);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  const uniswapFactory = getDeployed(
    CONTRACT_NAMES.UNISWAP_FACTORY_INTERFACE,
    mainnetAddrs.uniswap.UniswapFactory
  );
  uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER);

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
  const mlnExchangeAddress = await call(uniswapFactory, 'getExchange', [mln.options.address]);
  mlnExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE,
    mlnExchangeAddress
  );
  const zrxExchangeAddress = await call(uniswapFactory, 'getExchange', [zrx.options.address]);
  zrxExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE,
    zrxExchangeAddress
  );
});

test('Swap WETH for MLN with minimum derived from Uniswap price', async () => {
  const { vault } = fund;

  const outgoingAsset = weth.options.address;
  const outgoingAssetAmount = toWei('0.1', 'ether');
  const incomingAsset = mln.options.address;
  const expectedIncomingAssetAmount = await call(
    mlnExchange,
    'getEthToTokenInputPrice',
    [outgoingAssetAmount]
  );

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.UNISWAP.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      expectedIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  await send(
    vault,
    'callOnIntegration',
    [
      uniswapAdapter.options.address,
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

test('Swap MLN for WETH with minimum derived from Uniswap price', async () => {
  const { vault } = fund;

  const outgoingAsset = mln.options.address;
  const outgoingAssetAmount = toWei('0.01', 'ether');
  const incomingAsset = weth.options.address;
  const expectedIncomingAssetAmount = await call(
    mlnExchange,
    'getTokenToEthInputPrice',
    [outgoingAssetAmount]
  );

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.UNISWAP.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      expectedIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  await send(
    vault,
    'callOnIntegration',
    [
      uniswapAdapter.options.address,
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

test('Swap MLN directly to ZRX without specifying a minimum maker quantity', async () => {
  const { vault } = fund;

  const outgoingAsset = mln.options.address;
  const outgoingAssetAmount = toWei('0.01', 'ether');
  const incomingAsset = zrx.options.address;

  const intermediateEth = await call(
    mlnExchange,
    'getTokenToEthInputPrice',
    [outgoingAssetAmount]
  );
  const expectedIncomingAssetAmount = await call(
    zrxExchange,
    'getEthToTokenInputPrice',
    [intermediateEth]
  );

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.UNISWAP.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      1, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfEur = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

  await send(
    vault,
    'callOnIntegration',
    [
      uniswapAdapter.options.address,
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

test('Order fails if maker amount is not satisfied', async () => {
  const { vault } = fund;

  const outgoingAsset = mln.options.address;
  const outgoingAssetAmount = toWei('0.01', 'ether');
  const incomingAsset = weth.options.address;
  const expectedIncomingAssetAmount = await call(
    mlnExchange,
    'getTokenToEthInputPrice',
    [outgoingAssetAmount]
  );
  const tooHighIncomingAssetAmount = new BN(expectedIncomingAssetAmount).add(new BN(1)).toString();

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.UNISWAP.TAKE_ORDER,
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
        uniswapAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    )
  ).rejects.toThrow(); // No specific message, fails at Uniswap level
});
