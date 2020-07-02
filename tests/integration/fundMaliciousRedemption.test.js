/*
 * @file Tests fund's ability to handle a malicious redemption attempts
 *
 * @test Fund receives Malicious token
 * @test redeemShares fails
 * @test redeemSharesEmergency succeeds
 */

import mainnetAddrs from '~/config';
import { BN, toWei } from 'web3-utils';
import { call, deploy, send } from '~/utils/deploy-contract';
import { BNExpMul } from '~/utils/BNmath';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getDeployed } from '~/utils/getDeployed';
import { updateKyberPriceFeed, setKyberRate } from '../utils/updateKyberPriceFeed';
import { getFunctionSignature } from '~/utils/metadata';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  signZeroExOrder
} from '~/utils/zeroExV3';

let web3;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let fund, weth, mln, priceSource, maliciousToken;
let zeroExAdapter, zeroExExchange, erc20ProxyAddress;

// TODO: run this test when we can successfully deploy contracts on secondary forked chain
beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_ADAPTER, web3);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_EXCHANGE_INTERFACE, web3, mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  erc20ProxyAddress = mainnetAddrs.zeroExV3.ZeroExV3ERC20Proxy;
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  const registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);

  maliciousToken = await deploy(
    CONTRACT_NAMES.MALICIOUS_TOKEN,
    ['MLC', 18, 'Malicious'],
    {},
    [],
    web3
  );

  await send(
    registry,
    'registerPrimitive',
    [maliciousToken.options.address],
    defaultTxOpts,
    web3
  );

  // Set price for Malicious Token
  await setKyberRate(maliciousToken.options.address, web3);
  await updateKyberPriceFeed(priceSource, web3);

  fund = await setupFundWithParams({
    integrationAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('10', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
  });
});

test('Fund receives Malicious token via 0x order', async () => {
  const { vault } = fund;

  const makerAssetAmount = toWei('1', 'ether');
  const unsignedOrder = await createUnsignedZeroExOrder(
    zeroExExchange.options.address,
    await web3.eth.net.getId(),
    {
      makerAddress: deployer,
      makerTokenAddress: maliciousToken.options.address,
      makerAssetAmount,
      takerTokenAddress: weth.options.address,
      takerAssetAmount: toWei('0.5', 'Ether')
    },
    web3
  );

  await send(maliciousToken, 'approve', [erc20ProxyAddress, makerAssetAmount], defaultTxOpts, web3);
  const signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);

  await send(
    vault,
    'callOnIntegration',
    [
      zeroExAdapter.options.address,
      getFunctionSignature(CONTRACT_NAMES.ORDER_TAKER, 'takeOrder'),
      encodeZeroExTakeOrderArgs(signedOrder, signedOrder.takerAssetAmount, web3),
    ],
    managerTxOpts,
    web3
  );
});

test('redeemShares fails in presence of malicious token', async () => {
  const { shares } = fund;

  // Activate malicious token
  await send(maliciousToken, 'startReverting', [], defaultTxOpts, web3);

  await expect(
    send(shares, 'redeemShares', [], investorTxOpts, web3)
  ).rejects.toThrowFlexible();
});

test('redeemSharesEmergency succeeds in presence of malicious token', async () => {
  const { shares, vault } = fund;

  const preMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMaliciousToken = new BN(
    await call(maliciousToken, 'balanceOf', [vault.options.address])
  );

  const investorShares = await call(shares, 'balanceOf', [investor]);
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  await expect(
    send(shares, 'redeemSharesEmergency', [], investorTxOpts, web3)
  ).resolves.not.toThrow();

  const postMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  // const postFundBalanceOfMaliciousToken = new BN(
  //   await call(maliciousToken, 'balanceOf', [vault.options.address])
  // );

  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(shares, 'calcGav'));

  const maliciousTokenPrice = new BN(
    (await call(priceSource, 'getLiveRate', [maliciousToken.options.address, weth.options.address]))[0]
  );
  const fundMaliciousTokenValue = BNExpMul(preFundBalanceOfMaliciousToken, maliciousTokenPrice);

  expect(postTotalSupply).bigNumberEq(preTotalSupply.sub(new BN(investorShares)));
  expect(postWethInvestor).bigNumberEq(preWethInvestor.add(preFundBalanceOfWeth));
  expect(postFundBalanceOfWeth).bigNumberEq(new BN(0));
  expect(postFundBalanceOfMln).toEqual(preFundBalanceOfMln);
  expect(postMlnInvestor).toEqual(preMlnInvestor);
  expect(postFundGav).bigNumberEq(fundMaliciousTokenValue);
});
