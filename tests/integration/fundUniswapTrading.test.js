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
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeTakeOrderArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let zrx, mln, weth, fund;
let mlnExchange, zrxExchange;
let takeOrderSignature;
let uniswapAdapter;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.ZRX);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  const uniswapFactory = getDeployed(
    CONTRACT_NAMES.UNISWAP_FACTORY_INTERFACE,
    web3,
    mainnetAddrs.uniswap.UniswapFactory
  );
  uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER, web3);

  fund = await setupFundWithParams({
    integrationAdapters: [uniswapAdapter.options.address],
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

  // Load interfaces for uniswap exchanges of tokens to be traded
  const mlnExchangeAddress = await call(uniswapFactory, 'getExchange', [mln.options.address]);
  mlnExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE,
    web3,
    mlnExchangeAddress
  );
  const zrxExchangeAddress = await call(uniswapFactory, 'getExchange', [zrx.options.address]);
  zrxExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE,
    web3,
    zrxExchangeAddress
  );
});

test('Swap WETH for MLN with minimum derived from Uniswap price', async () => {
  const { vault } = fund;

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

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
  }, web3);

  await send(
    vault,
    'callOnIntegration',
    [
      uniswapAdapter.options.address,
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

test('Swap MLN for WETH with minimum derived from Uniswap price', async () => {
  const { vault } = fund;

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

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
  }, web3);

  await send(
    vault,
    'callOnIntegration',
    [
      uniswapAdapter.options.address,
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

test('Swap MLN directly to EUR without specifying a minimum maker quantity', async () => {
  const { vault } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = zrx.options.address;
  const makerQuantity = "1";

  const intermediateEth = await call(
    mlnExchange,
    'getTokenToEthInputPrice',
    [takerQuantity]
  );
  const expectedMakerQuantity = await call(
    zrxExchange,
    'getEthToTokenInputPrice',
    [intermediateEth]
  );

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
      uniswapAdapter.options.address,
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
  expect(fundBalanceOfEurDiff).bigNumberEq(new BN(expectedMakerQuantity));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(0));
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
  }, web3);

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
      web3
    )
  ).rejects.toThrow(); // No specific message, fails at Uniswap level
});
