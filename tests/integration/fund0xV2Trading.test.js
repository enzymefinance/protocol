/*
 * @file Tests funds trading via the 0x adapter
 *
 * @test Fund takes an order
 * @test Fund takes an order with a taker fee
 * @test Fund makes an order, taken by third party
 * @test Fund makes a second order with same asset pair (after accounting updated)
 * @test Fund can cancel order with the orderId
 * @test TODO: order expiry
 */

import { orderHashUtils } from '@0x/order-utils-v2';
import { BN, randomHex, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime, mine } from '~/tests/utils/rpc';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';
import {
  createUnsignedZeroExOrder,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let contracts, deployOut;
let mln, zrx, weth, priceSource, version, zeroExExchange, erc20Proxy, fund, zeroExAdapter;
let signedOrder1, signedOrder2, signedOrder3, signedOrder4;
let makeOrderSignature, takeOrderSignature, cancelOrderSignature;

beforeAll(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;
  deployOut = deployed.deployOut;

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );
  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );
  cancelOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'cancelOrder',
  )

  mln = contracts.MLN;
  zrx = contracts.ZRX;
  weth = contracts.WETH;
  priceSource = contracts.TestingPriceFeed;
  version = contracts.Version;
  zeroExExchange = contracts.ZeroExV2Exchange;
  zeroExAdapter = contracts.ZeroExV2Adapter;
  erc20Proxy = contracts.ZeroExV2ERC20Proxy;

  // TODO: can we factor into setupInvestedTestFund?
  const fundName = stringToBytes('Test fund', 32);
  await version.methods
    .beginSetup(
      fundName,
      [],
      [],
      [],
      [zeroExExchange.options.address],
      [zeroExAdapter.options.address],
      weth.options.address,
      [
        mln.options.address,
        weth.options.address
      ]
    )
    .send(managerTxOpts);
  await version.methods.createAccounting().send(managerTxOpts);
  await version.methods.createFeeManager().send(managerTxOpts);
  await version.methods.createParticipation().send(managerTxOpts);
  await version.methods.createPolicyManager().send(managerTxOpts);
  await version.methods.createShares().send(managerTxOpts);
  await version.methods.createTrading().send(managerTxOpts);
  await version.methods.createVault().send(managerTxOpts);
  const res = await version.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  fund = await getFundComponents(hubAddress);

  await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));

  // Seed investor and fund with ETH and ZRX
  await weth.methods
    .transfer(investor, toWei('10', 'ether'))
    .send(defaultTxOpts);
  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('.01', 'ether');
  await weth.methods
    .approve(fund.participation.options.address, offeredValue)
    .send(investorTxOpts);
  await fund.participation.methods
    .requestInvestment(
      offeredValue,
      wantedShares,
      weth.options.address,
    ).send({ ...investorTxOpts, value: amguAmount });
  await fund.participation.methods
    .executeRequestFor(investor)
    .send(investorTxOpts);
  await zrx.methods
    .transfer(fund.vault.options.address, toWei('10', 'ether'))
    .send(defaultTxOpts);
});

test('third party makes and validates an off-chain order (1)', async () => {
  const makerAddress = deployer;
  const makerAssetAmount = toWei('1', 'Ether');
  const takerAssetAmount = toWei('0.05', 'Ether');

  const unsignedOrder = await createUnsignedZeroExOrder(
    zeroExExchange.options.address,
    {
      makerAddress,
      makerTokenAddress: mln.options.address,
      makerAssetAmount,
      takerTokenAddress: weth.options.address,
      takerAssetAmount,
    },
  );

  await mln.methods
    .approve(erc20Proxy.options.address, makerAssetAmount)
    .send(defaultTxOpts);

  signedOrder1 = await signZeroExOrder(unsignedOrder, deployer);
  const signatureValid = await isValidZeroExSignatureOffChain(
    unsignedOrder,
    signedOrder1.signature,
    deployer
  );

  expect(signatureValid).toBeTruthy();
});

test('manager takes order 1 through 0x adapter', async () => {
  const { trading } = fund;
  const fillQuantity = signedOrder1.takerAssetAmount;

  const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
  const preMlnFund = await mln.methods
    .balanceOf(fund.vault.options.address)
    .call();
  const preWethDeployer = await weth.methods.balanceOf(deployer).call();
  const preWethFund = await weth.methods
    .balanceOf(fund.vault.options.address)
    .call();

  await trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        deployer,
        EMPTY_ADDRESS,
        mln.options.address,
        weth.options.address,
        signedOrder1.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedOrder1.makerAssetAmount,
        signedOrder1.takerAssetAmount,
        signedOrder1.makerFee,
        signedOrder1.takerFee,
        signedOrder1.expirationTimeSeconds,
        signedOrder1.salt,
        fillQuantity,
        0,
      ],
      [signedOrder1.makerAssetData, signedOrder1.takerAssetData, '0x0', '0x0'],
      '0x0',
      signedOrder1.signature,
    )
    .send(managerTxOpts);

  const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
  const postMlnFund = await mln.methods
    .balanceOf(fund.vault.options.address)
    .call();
  const postWethDeployer = await weth.methods.balanceOf(deployer).call();
  const postWethFund = await weth.methods
    .balanceOf(fund.vault.options.address)
    .call();
  const heldInExchange = await trading.methods
    .updateAndGetQuantityHeldInExchange(weth.options.address)
    .call();

  expect(heldInExchange).toBe('0');
  expect(
    new BN(postMlnDeployer).eq(
      new BN(preMlnDeployer).sub(new BN(signedOrder1.makerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postWethFund).eq(
      new BN(preWethFund).sub(new BN(signedOrder1.takerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postMlnFund).eq(
      new BN(preMlnFund).add(new BN(signedOrder1.makerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postWethDeployer).eq(
      new BN(preWethDeployer).add(new BN(signedOrder1.takerAssetAmount))
    )
  ).toBe(true);
});

test('third party makes and validates an off-chain order (2)', async () => {
  const makerAddress = deployer;
  const takerFee = new BN(toWei('0.0001', 'ether'));

  const makerAssetAmount = toWei('1', 'Ether');
  const takerAssetAmount = toWei('0.05', 'Ether');

  const unsignedOrder = await createUnsignedZeroExOrder(
    zeroExExchange.options.address,
    {
      feeRecipientAddress: investor,
      makerAddress,
      makerTokenAddress: mln.options.address,
      makerAssetAmount,
      takerFee,
      takerTokenAddress: weth.options.address,
      takerAssetAmount,
    },
  );

  await mln.methods
    .approve(erc20Proxy.options.address, makerAssetAmount)
    .send(defaultTxOpts);

  signedOrder2 = await signZeroExOrder(unsignedOrder, deployer);
  const signatureValid = await isValidZeroExSignatureOffChain(
    unsignedOrder,
    signedOrder2.signature,
    deployer
  );

  expect(signatureValid).toBeTruthy();
});

test('fund with enough ZRX takes order 2', async () => {
  const { trading } = fund;
  const fillQuantity = signedOrder2.takerAssetAmount;

  const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
  const preMlnFund = await mln.methods
    .balanceOf(fund.vault.options.address)
    .call();
  const preWethDeployer = await weth.methods.balanceOf(deployer).call();
  const preWethFund = await weth.methods
    .balanceOf(fund.vault.options.address)
    .call();
  const preZrxFund = await zrx.methods
    .balanceOf(fund.vault.options.address)
    .call();

  await trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        deployer,
        EMPTY_ADDRESS,
        mln.options.address,
        weth.options.address,
        signedOrder2.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedOrder2.makerAssetAmount,
        signedOrder2.takerAssetAmount,
        signedOrder2.makerFee,
        signedOrder2.takerFee,
        signedOrder2.expirationTimeSeconds,
        signedOrder2.salt,
        fillQuantity,
        0,
      ],
      [signedOrder2.makerAssetData, signedOrder2.takerAssetData, '0x0', '0x0'],
      '0x0',
      signedOrder2.signature,
    )
    .send(managerTxOpts);

  const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
  const postMlnFund = await mln.methods
    .balanceOf(fund.vault.options.address)
    .call();
  const postWethDeployer = await weth.methods.balanceOf(deployer).call();
  const postWethFund = await weth.methods
    .balanceOf(fund.vault.options.address)
    .call();
  const postZrxFund = await zrx.methods
    .balanceOf(fund.vault.options.address)
    .call();

  const heldInExchange = await trading.methods
    .updateAndGetQuantityHeldInExchange(weth.options.address)
    .call();

  expect(heldInExchange).toBe('0');
  expect(
    new BN(postMlnDeployer).eq(
      new BN(preMlnDeployer).sub(new BN(signedOrder2.makerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postWethFund).eq(
      new BN(preWethFund).sub(new BN(signedOrder2.takerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postMlnFund).eq(
      new BN(preMlnFund).add(new BN(signedOrder2.makerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postWethDeployer).eq(
      new BN(preWethDeployer).add(new BN(signedOrder2.takerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postZrxFund).eq(
      new BN(preZrxFund).sub(new BN(signedOrder2.takerFee))
    )
  ).toBe(true);
});

test('Make order through the fund', async () => {
  const { trading } = fund;

  const makerAddress = trading.options.address;
  const makerTokenAddress = weth.options.address;
  const makerAssetAmount = toWei('0.05', 'ether');
  const takerTokenAddress = mln.options.address;
  const takerAssetAmount = toWei('0.5', 'ether');

  const unsignedOrder = await createUnsignedZeroExOrder(
    zeroExExchange.options.address,
    {
      makerAddress,
      makerTokenAddress,
      makerAssetAmount,
      takerTokenAddress,
      takerAssetAmount,
    },
  );
  signedOrder3 = await signZeroExOrder(unsignedOrder, manager);
  await trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        EMPTY_ADDRESS,
        makerTokenAddress,
        takerTokenAddress,
        signedOrder3.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedOrder3.makerAssetAmount,
        signedOrder3.takerAssetAmount,
        signedOrder3.makerFee,
        signedOrder3.takerFee,
        signedOrder3.expirationTimeSeconds,
        signedOrder3.salt,
        0,
        0,
      ],
      [signedOrder3.makerAssetData, signedOrder3.takerAssetData, '0x0', '0x0'],
      '0x0',
      signedOrder3.signature,
    )
    .send(managerTxOpts);
  const makerAssetAllowance = await weth.methods
    .allowance(
      makerAddress,
      erc20Proxy.options.address,
    )
    .call();
  expect(
    new BN(makerAssetAllowance).eq(new BN(signedOrder3.makerAssetAmount))
  ).toBe(true);
});

test('Third party takes the order made by the fund', async () => {
  const { accounting, trading } = fund;

  const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
  const preMlnFundHoldings = await accounting.methods
    .assetHoldings(mln.options.address)
    .call()
  const preWethDeployer = await weth.methods.balanceOf(deployer).call();
  const preWethFundHoldings = await accounting.methods
    .assetHoldings(weth.options.address)
    .call()

  await mln.methods
    .approve(erc20Proxy.options.address, signedOrder3.takerAssetAmount)
    .send(defaultTxOpts);

  const res = await zeroExExchange.methods
    .fillOrder(
      signedOrder3,
      signedOrder3.takerAssetAmount,
      signedOrder3.signature
    )
    .send(defaultTxOpts)

  const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
  const postMlnFundHoldings = await accounting.methods
    .assetHoldings(mln.options.address)
    .call()
  const postWethDeployer = await weth.methods.balanceOf(deployer).call();
  const postWethFundHoldings = await accounting.methods
    .assetHoldings(weth.options.address)
    .call()

  // Update accounting so maker asset is no longer marked as in an open order
  await trading.methods
    .updateAndGetQuantityBeingTraded(weth.options.address)
    .send(managerTxOpts);

  const isInOpenMakeOrder = await trading.methods
    .isInOpenMakeOrder(weth.options.address)
    .call();
  expect(isInOpenMakeOrder).toEqual(false);

  // Increment next block time past the maker asset cooldown period
  const cooldownTime = await trading.methods.MAKE_ORDER_COOLDOWN().call();
  await increaseTime(Number(cooldownTime)+1);
  await mine();

  expect(
    new BN(postMlnFundHoldings).eq(
      new BN(preMlnFundHoldings).add(new BN(signedOrder3.takerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postWethFundHoldings).eq(
      new BN(preWethFundHoldings).sub(new BN(signedOrder3.makerAssetAmount))
    )
  ).toBe(true);

  expect(
    new BN(postMlnDeployer).eq(
      new BN(preMlnDeployer).sub(new BN(signedOrder3.takerAssetAmount))
    )
  ).toBe(true);
  expect(
    new BN(postWethDeployer).eq(
      new BN(preWethDeployer).add(new BN(signedOrder3.makerAssetAmount))
    )
  ).toBe(true);
});

test("Fund can make 2nd order for same asset pair (after it's taken)", async () => {
  const { trading } = fund;

  const makerAddress = trading.options.address;
  const makerAssetAmount = toWei('0.05', 'Ether');
  const takerAssetAmount = toWei('0.5', 'Ether');

  const unsignedOrder = await createUnsignedZeroExOrder(
    zeroExExchange.options.address,
    {
      makerAddress,
      makerTokenAddress: weth.options.address,
      makerAssetAmount,
      takerTokenAddress: mln.options.address,
      takerAssetAmount,
    },
  );

  signedOrder4 = await signZeroExOrder(unsignedOrder, manager);
  await trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        EMPTY_ADDRESS,
        weth.options.address,
        mln.options.address,
        signedOrder4.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedOrder4.makerAssetAmount,
        signedOrder4.takerAssetAmount,
        signedOrder4.makerFee,
        signedOrder4.takerFee,
        signedOrder4.expirationTimeSeconds,
        signedOrder4.salt,
        0,
        0,
      ],
      [signedOrder4.makerAssetData, signedOrder4.takerAssetData, '0x0', '0x0'],
      '0x0',
      signedOrder4.signature,
    )
    .send(managerTxOpts);

  const makerAssetAllowance = await weth.methods
      .allowance(
        trading.options.address,
        erc20Proxy.options.address,
      )
      .call();
  expect(
    new BN(makerAssetAllowance).eq(new BN(signedOrder4.makerAssetAmount))
  ).toBe(true);
});

test('Fund can cancel the order using just the orderId', async () => {
  const { trading } = fund;

  const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder4);
  await trading.methods
    .callOnExchange(
      0,
      cancelOrderSignature,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      orderHashHex,
      '0x0',
    )
    .send(managerTxOpts);
  const isOrderCancelled = await zeroExExchange.methods
    .cancelled(orderHashHex)
    .call();

  const makerAssetAllowance = await mln.methods
    .allowance(
      trading.options.address,
      erc20Proxy.options.address,
    )
    .call();

  expect(new BN(makerAssetAllowance).eq(new BN(0))).toBe(true);
  expect(isOrderCancelled).toBeTruthy();

  // Confirm open make order has been removed
  await trading.methods
    .updateAndGetQuantityBeingTraded(weth.options.address)
    .send(managerTxOpts);
  const isInOpenMakeOrder = await trading.methods
    .isInOpenMakeOrder(weth.options.address)
    .call();

  expect(isInOpenMakeOrder).toBeFalsy();
});

// TODO - Expired order
