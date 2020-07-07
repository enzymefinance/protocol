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

let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let fund, weth, mln, priceSource, maliciousToken;
let zeroExAdapter, zeroExExchange, erc20ProxyAddress;

// TODO: run this test when we can successfully deploy contracts on secondary forked chain
beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_ADAPTER);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_EXCHANGE_INTERFACE, mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  erc20ProxyAddress = mainnetAddrs.zeroExV3.ZeroExV3ERC20Proxy;
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  const registry = getDeployed(CONTRACT_NAMES.REGISTRY);

  maliciousToken = await deploy(
    CONTRACT_NAMES.MALICIOUS_TOKEN,
    ['MLC', 18, 'Malicious'],
    {},
    []
  );

  await send(
    registry,
    'registerPrimitive',
    [maliciousToken.options.address],
    defaultTxOpts
  );

  // Set price for Malicious Token
  await setKyberRate(maliciousToken.options.address);
  await updateKyberPriceFeed(priceSource);

  fund = await setupFundWithParams({
    integrationAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('10', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });
});

test('Fund receives Malicious token via 0x order', async () => {
  const { vault } = fund;

  const makerAssetAmount = toWei('1', 'ether');
  const takerAssetAmount = toWei('0.5', 'Ether');
  const unsignedOrder = await createUnsignedZeroExOrder(
    zeroExExchange.options.address,
    await web3.eth.net.getId(),
    {
      makerAddress: deployer,
      makerTokenAddress: maliciousToken.options.address,
      makerAssetAmount,
      takerTokenAddress: weth.options.address,
      takerAssetAmount
    }
  );

  await send(maliciousToken, 'approve', [erc20ProxyAddress, makerAssetAmount], defaultTxOpts);
  const signedOrder = await signZeroExOrder(unsignedOrder, deployer);

  await send(
    vault,
    'callOnIntegration',
    [
      zeroExAdapter.options.address,
      getFunctionSignature(CONTRACT_NAMES.ZERO_EX_V3_ADAPTER, 'takeOrder'),
      encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount),
    ],
    managerTxOpts
  );
});

test('redeemShares fails in presence of malicious token', async () => {
  const { shares } = fund;

  // Activate malicious token
  await send(maliciousToken, 'startReverting', [], defaultTxOpts);

  await expect(
    send(shares, 'redeemShares', [], investorTxOpts)
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
    send(shares, 'redeemSharesEmergency', [], investorTxOpts)
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
