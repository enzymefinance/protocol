import { orderHashUtils } from '@0x/order-utils';
import {
  createQuantity,
  BigInteger,
  add,
  subtract,
  toBI,
} from '@melonproject/token-math';

import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
} from '~/utils/constants/orderSignatures';
import {
  createOrder,
  approveOrder,
  isValidSignatureOffChain,
} from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { getAssetProxy } from '~/contracts/exchanges/third-party/0x/calls/getAssetProxy';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployAndGetSystem } from '~/tests/utils/deployAndGetSystem';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { completeSetup } from '~/contracts/factory/transactions/completeSetup';
import { createAccounting } from '~/contracts/factory/transactions/createAccounting';
import { createFeeManager } from '~/contracts/factory/transactions/createFeeManager';
import { createParticipation } from '~/contracts/factory/transactions/createParticipation';
import { createPolicyManager } from '~/contracts/factory/transactions/createPolicyManager';
import { createShares } from '~/contracts/factory/transactions/createShares';
import { createTrading } from '~/contracts/factory/transactions/createTrading';
import { createVault } from '~/contracts/factory/transactions/createVault';
import { getFundComponents } from '~/utils/getFundComponents';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { Exchanges } from '~/Contracts';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { increaseTime } from '~/utils/evm/increaseTime';
import { fillOrder } from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';

// mock data
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem(s.environment);
  s.addresses = addresses;
  s = Object.assign(s, contracts);

  [s.deployer, s.manager, s.investor] = s.accounts;
  s.exchanges = [s.matchingMarket]; // , matchingMarket2];
  s.gas = 8000000;
  s.opts = { from: s.deployer, gas: s.gas };
  s.numberofExchanges = 1;
  s.exchanges = [s.matchingMarket];
  s.erc20ProxyAddress = await getAssetProxy(
    s.environment,
    s.zeroExExchange.options.address,
  );
  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);
  const exchangeConfigs = {
    [Exchanges.ZeroEx]: {
      adapter: s.zeroExAdapter.options.address,
      exchange: s.zeroExExchange.options.address,
      takesCustody: false,
    },
  };
  const envManager = withDifferentAccount(s.environment, s.manager);
  await beginSetup(envManager, s.version.options.address, {
    defaultTokens: [s.wethTokenInterface, s.mlnTokenInterface],
    exchangeConfigs,
    fees: [],
    fundName: 'Test fund',
    quoteToken: s.wethTokenInterface,
  });
  await createAccounting(envManager, s.version.options.address);
  await createFeeManager(envManager, s.version.options.address);
  await createParticipation(envManager, s.version.options.address);
  await createPolicyManager(envManager, s.version.options.address);
  await createShares(envManager, s.version.options.address);
  await createTrading(envManager, s.version.options.address);
  await createVault(envManager, s.version.options.address);
  const hubAddress = await completeSetup(envManager, s.version.options.address);
  s.fund = await getFundComponents(envManager, hubAddress);
  await updateTestingPriceFeed(s, s.environment);
});

const initialTokenAmount = new BigInteger(10 ** 19);
test('investor gets initial ethToken for testing)', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  await s.weth.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send(s.opts);
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(post.investor.weth).toEqual(
    add(pre.investor.weth, initialTokenAmount),
  );
});

// tslint:disable-next-line:max-line-length
test('fund receives ETH from investment, and gets ZRX from direct transfer', async () => {
  const offeredValue = new BigInteger(10 ** 18);
  const wantedShares = new BigInteger(10 ** 18);
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  await s.weth.methods
    .approve(s.fund.participation.options.address, `${offeredValue}`)
    .send({ from: s.investor, gas: s.gas });
  await s.fund.participation.methods
    .requestInvestment(
      `${offeredValue}`,
      `${wantedShares}`,
      s.weth.options.address,
    )
    .send({ from: s.investor, gas: s.gas, value: '10000000000000000' });
  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });
  await s.zrx.methods
    .transfer(s.fund.vault.options.address, `${initialTokenAmount}`)
    .send({ from: s.deployer, gas: s.gas });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(post.investor.weth).toEqual(subtract(pre.investor.weth, offeredValue));
  expect(post.fund.weth).toEqual(add(pre.fund.weth, offeredValue));
});

test('third party makes and validates an off-chain order', async () => {
  const makerAddress = s.deployer.toLowerCase();
  const makerQuantity = createQuantity(s.mlnTokenInterface, 1);
  const takerQuantity = createQuantity(s.wethTokenInterface, 0.05);

  const unsignedOrder = await createOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      makerAddress,
      makerQuantity,
      takerQuantity,
    },
  );

  await approveOrder(
    s.environment,
    s.zeroExExchange.options.address,
    unsignedOrder,
  );
  s.signedOrder = await signOrder(s.environment, unsignedOrder);
  const signatureValid = await isValidSignatureOffChain(
    s.environment,
    unsignedOrder,
    s.signedOrder.signature,
  );

  expect(signatureValid).toBeTruthy();
});

// tslint:disable-next-line:max-line-length
test('manager takes order (half the total quantity) through 0x adapter', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const fillQuantity = s.signedOrder.takerAssetAmount;
  await s.fund.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        s.deployer,
        NULL_ADDRESS,
        s.mln.options.address,
        s.weth.options.address,
        s.signedOrder.feeRecipientAddress,
        NULL_ADDRESS,
      ],
      [
        s.signedOrder.makerAssetAmount.toFixed(),
        s.signedOrder.takerAssetAmount.toFixed(),
        s.signedOrder.makerFee.toFixed(),
        s.signedOrder.takerFee.toFixed(),
        s.signedOrder.expirationTimeSeconds.toFixed(),
        s.signedOrder.salt.toFixed(),
        `${fillQuantity}`,
        0,
      ],
      randomHexOfSize(20),
      s.signedOrder.makerAssetData,
      s.signedOrder.takerAssetData,
      s.signedOrder.signature,
    )
    .send({ from: s.manager, gas: s.gas });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const heldInExchange = await s.fund.trading.methods
    .updateAndGetQuantityHeldInExchange(s.weth.options.address)
    .call();

  expect(heldInExchange).toBe('0');
  expect(post.deployer.mln).toEqual(
    subtract(pre.deployer.mln, toBI(s.signedOrder.makerAssetAmount)),
  );
  expect(post.fund.weth).toEqual(
    subtract(pre.fund.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
  expect(post.fund.mln).toEqual(
    add(pre.fund.mln, toBI(s.signedOrder.makerAssetAmount)),
  );
  expect(post.deployer.weth).toEqual(
    add(pre.deployer.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
});

test('third party makes and validates an off-chain order', async () => {
  const makerAddress = s.deployer.toLowerCase();
  const makerQuantity = createQuantity(s.mlnTokenInterface, 1);
  const takerQuantity = createQuantity(s.wethTokenInterface, 0.05);
  const takerFee = new BigInteger(10 ** 14);

  const unsignedOrder = await createOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      feeRecipientAddress: s.investor,
      makerAddress,
      makerQuantity,
      takerFee,
      takerQuantity,
    },
  );

  await approveOrder(
    s.environment,
    s.zeroExExchange.options.address,
    unsignedOrder,
  );
  s.signedOrder = await signOrder(s.environment, unsignedOrder);
  const signatureValid = await isValidSignatureOffChain(
    s.environment,
    unsignedOrder,
    s.signedOrder.signature,
  );

  expect(signatureValid).toBeTruthy();
});

test('fund with enough ZRX takes the above order', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preFundZrx = new BigInteger(
    await s.zrx.methods.balanceOf(s.fund.vault.options.address).call(),
  );
  const fillQuantity = s.signedOrder.takerAssetAmount;
  await s.fund.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        s.deployer,
        NULL_ADDRESS,
        s.mln.options.address,
        s.weth.options.address,
        s.signedOrder.feeRecipientAddress,
        NULL_ADDRESS,
      ],
      [
        s.signedOrder.makerAssetAmount.toFixed(),
        s.signedOrder.takerAssetAmount.toFixed(),
        s.signedOrder.makerFee.toFixed(),
        s.signedOrder.takerFee.toFixed(),
        s.signedOrder.expirationTimeSeconds.toFixed(),
        s.signedOrder.salt.toFixed(),
        `${fillQuantity}`,
        0,
      ],
      randomHexOfSize(20),
      s.signedOrder.makerAssetData,
      s.signedOrder.takerAssetData,
      s.signedOrder.signature,
    )
    .send({ from: s.manager, gas: s.gas });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postFundZrx = new BigInteger(
    await s.zrx.methods.balanceOf(s.fund.vault.options.address).call(),
  );
  const heldInExchange = await s.fund.trading.methods
    .updateAndGetQuantityHeldInExchange(s.weth.options.address)
    .call();

  expect(heldInExchange).toBe('0');
  expect(postFundZrx).toEqual(
    subtract(preFundZrx, toBI(s.signedOrder.takerFee)),
  );
  expect(post.deployer.mln).toEqual(
    subtract(pre.deployer.mln, toBI(s.signedOrder.makerAssetAmount)),
  );
  expect(post.fund.weth).toEqual(
    subtract(pre.fund.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
  expect(post.fund.mln).toEqual(
    add(pre.fund.mln, toBI(s.signedOrder.makerAssetAmount)),
  );
  expect(post.deployer.weth).toEqual(
    add(pre.deployer.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
});

test('Make order through the fund', async () => {
  const makerAddress = s.fund.trading.options.address.toLowerCase();
  const makerQuantity = createQuantity(s.mlnTokenInterface, 0.5);
  const takerQuantity = createQuantity(s.wethTokenInterface, 0.05);
  const unsignedOrder = await createOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      makerAddress,
      makerQuantity,
      takerQuantity,
    },
  );
  s.signedOrder = await signOrder(s.environment, unsignedOrder, s.manager);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        s.mln.options.address,
        s.weth.options.address,
        s.signedOrder.feeRecipientAddress,
        NULL_ADDRESS,
      ],
      [
        s.signedOrder.makerAssetAmount.toFixed(),
        s.signedOrder.takerAssetAmount.toFixed(),
        s.signedOrder.makerFee.toFixed(),
        s.signedOrder.takerFee.toFixed(),
        s.signedOrder.expirationTimeSeconds.toFixed(),
        s.signedOrder.salt.toFixed(),
        0,
        0,
      ],
      randomHexOfSize(20),
      s.signedOrder.makerAssetData,
      s.signedOrder.takerAssetData,
      s.signedOrder.signature,
    )
    .send({ from: s.manager, gas: s.gas });
  const makerAssetAllowance = new BigInteger(
    await s.mln.methods
      .allowance(
        s.fund.trading.options.address,
        s.erc20ProxyAddress.toLowerCase(),
      )
      .call(),
  );
  expect(makerAssetAllowance).toEqual(
    new BigInteger(s.signedOrder.makerAssetAmount),
  );
});

// test.serial(
//   'Fund cannot make multiple orders for same asset unless fulfilled',
//   async t => {
//     await t.throws(
//       fund.trading.methods
//         .callOnExchange(
//           0,
//           makeOrderSignature,
//           [
//             fund.trading.options.address.toLowerCase(),
//             NULL_ADDRESS,
//             mlnToken.options.address,
//             ethToken.options.address,
//             order.feeRecipientAddress,
//             NULL_ADDRESS,
//           ],
//           [
//             order.makerAssetAmount.toFixed(),
//             order.takerAssetAmount.toFixed(),
//             order.makerFee.toFixed(),
//             order.takerFee.toFixed(),
//             order.expirationTimeSeconds.toFixed(),
//             559,
//             0,
//             0,
//           ],
//           web3.utils.padLeft('0x0', 64),
//           order.makerAssetData,
//           order.takerAssetData,
//           orderSignature,
//         )
//         .send({ from: manager, gas: config.gas }),
//     );
//   },
// );

test('Third party takes the order made by the fund', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const result = await fillOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      signedOrder: s.signedOrder,
    },
  );

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(result).toBeTruthy();
  expect(post.fund.weth).toEqual(
    add(pre.fund.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
  expect(post.fund.mln).toEqual(
    subtract(pre.fund.mln, toBI(s.signedOrder.makerAssetAmount)),
  );
  expect(post.deployer.weth).toEqual(
    subtract(pre.deployer.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
  expect(post.deployer.mln).toEqual(
    add(pre.deployer.mln, toBI(s.signedOrder.makerAssetAmount)),
  );
});

// tslint:disable-next-line:max-line-length
test("Fund can make another make order for same asset (After it's inactive)", async () => {
  const makerAddress = s.fund.trading.options.address.toLowerCase();
  const makerQuantity = createQuantity(s.wethTokenInterface, 0.05);
  const takerQuantity = createQuantity(s.mlnTokenInterface, 0.5);
  s.unsignedOrder = await createOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      feeRecipientAddress: s.investor,
      makerAddress,
      makerQuantity,
      takerQuantity,
    },
  );
  s.signedOrder = await signOrder(s.environment, s.unsignedOrder, s.manager);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        s.weth.options.address,
        s.mln.options.address,
        s.signedOrder.feeRecipientAddress,
        NULL_ADDRESS,
      ],
      [
        s.signedOrder.makerAssetAmount.toFixed(),
        s.signedOrder.takerAssetAmount.toFixed(),
        s.signedOrder.makerFee.toFixed(),
        s.signedOrder.takerFee.toFixed(),
        s.signedOrder.expirationTimeSeconds.toFixed(),
        s.signedOrder.salt.toFixed(),
        0,
        0,
      ],
      randomHexOfSize(20),
      s.signedOrder.makerAssetData,
      s.signedOrder.takerAssetData,
      s.signedOrder.signature,
    )
    .send({ from: s.manager, gas: s.gas });
  const makerAssetAllowance = new BigInteger(
    await s.weth.methods
      .allowance(
        s.fund.trading.options.address,
        s.erc20ProxyAddress.toLowerCase(),
      )
      .call(),
  );
  expect(makerAssetAllowance).toEqual(
    new BigInteger(s.signedOrder.makerAssetAmount),
  );
});

test('Fund can cancel the order using just the orderId', async () => {
  const orderHashHex = orderHashUtils.getOrderHashHex(s.unsignedOrder);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      cancelOrderSignature,
      [
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      orderHashHex,
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: s.manager, gas: s.gas });
  const isOrderCancelled = await s.zeroExExchange.methods
    .cancelled(orderHashHex)
    .call();

  const makerAssetAllowance = new BigInteger(
    await s.mln.methods
      .allowance(
        s.fund.trading.options.address,
        s.erc20ProxyAddress.toLowerCase(),
      )
      .call(),
  );
  expect(makerAssetAllowance).toEqual(new BigInteger(0));
  expect(isOrderCancelled).toBeTruthy();
});

test('Expired order is removed from open maker order', async () => {
  const makerAddress = s.fund.trading.options.address.toLowerCase();
  const makerQuantity = createQuantity(s.wethTokenInterface, 0.05);
  const takerQuantity = createQuantity(s.mlnTokenInterface, 0.5);
  const duration = 50;
  s.unsignedOrder = await createOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      duration,
      feeRecipientAddress: s.investor,
      makerAddress,
      makerQuantity,
      takerQuantity,
    },
  );
  s.signedOrder = await signOrder(s.environment, s.unsignedOrder, s.manager);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        s.weth.options.address,
        s.mln.options.address,
        s.signedOrder.feeRecipientAddress,
        NULL_ADDRESS,
      ],
      [
        s.signedOrder.makerAssetAmount.toFixed(),
        s.signedOrder.takerAssetAmount.toFixed(),
        s.signedOrder.makerFee.toFixed(),
        s.signedOrder.takerFee.toFixed(),
        s.signedOrder.expirationTimeSeconds.toFixed(),
        s.signedOrder.salt.toFixed(),
        0,
        0,
      ],
      randomHexOfSize(20),
      s.signedOrder.makerAssetData,
      s.signedOrder.takerAssetData,
      s.signedOrder.signature,
    )
    .send({ from: s.manager, gas: s.gas });
  const makerAssetAllowance = new BigInteger(
    await s.weth.methods
      .allowance(
        s.fund.trading.options.address,
        s.erc20ProxyAddress.toLowerCase(),
      )
      .call(),
  );
  expect(makerAssetAllowance).toEqual(
    new BigInteger(s.signedOrder.makerAssetAmount),
  );

  const orderHashHex = orderHashUtils.getOrderHashHex(s.unsignedOrder);
  await increaseTime(s.environment, duration);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      cancelOrderSignature,
      [
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      orderHashHex,
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: s.manager, gas: s.gas });
  await s.fund.trading.methods
    .updateAndGetQuantityBeingTraded(s.weth.options.address)
    .send({ from: s.manager, gas: s.gas });
  const isInOpenMakeOrder = await s.fund.trading.methods
    .isInOpenMakeOrder(s.weth.options.address)
    .call();

  expect(isInOpenMakeOrder).toBeFalsy();
});
