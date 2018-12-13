import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
} from '~/utils/constants/orderSignatures';
import {
  createOrder,
  signOrder,
  approveOrder,
  isValidSignatureOffChain,
} from '~/contracts/exchanges/thirdparty/0x/utils/createOrder';
import { fillOrder } from '~/contracts/exchanges/thirdparty/0x';
import { orderHashUtils } from '@0x/order-utils';
import { createQuantity } from '@melonproject/token-math/quantity';
import {
  BigInteger,
  add,
  subtract,
  multiply,
  divide,
  power,
} from '@melonproject/token-math/bigInteger';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployAndGetSystem } from '~/utils/deployAndGetSystem';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getFundComponents } from '~/utils/getFundComponents';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { Contracts } from '~/Contracts';
import { deploy } from '~/utils/solidity/deploy';
import { sign } from '~/utils/environment/sign';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
// import { deployPolicyManagerFactory } from '~/contracts/fund/policies/transactions/deployPolicyManagerFactory';

// mock data
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const precisionUnits = power(new BigInteger(10), new BigInteger(18));

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

  await s.version.methods
    .createComponents(
      'Test Fund',
      [],
      [s.zeroExExchange.options.address],
      [s.zeroExAdapter.options.address],
      s.weth.options.address,
      s.weth.options.address,
      [s.weth.options.address, s.mln.options.address],
      [true],
      s.priceSource.options.address,
    )
    .send({ from: s.manager, gasPrice: s.gasPrice, gas: s.gas });
  await s.version.methods
    .continueCreation()
    .send({ from: s.manager, gasPrice: s.gasPrice, gas: s.gas });
  await s.version.methods
    .setupFund()
    .send({ from: s.manager, gasPrice: s.gasPrice, gas: s.gas });
  const fundId = await s.version.methods.getLastFundId().call();
  const hubAddress = await s.version.methods.getFundById(fundId).call();
  s.fund = await getFundComponents(s.environment, hubAddress);
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
    .send({ from: s.investor, gas: s.gas });
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
  const mlnTokenInterface = await getToken(
    s.environment,
    s.mln.options.address,
  );
  const wethTokenInterface = await getToken(
    s.environment,
    s.weth.options.address,
  );
  const makerQuantity = createQuantity(mlnTokenInterface, 1);
  const takerQuantity = createQuantity(wethTokenInterface, 0.05);

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

test('manager takes order (half the total quantity) through 0x adapter', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const fillQuantity = divide(
    s.signedOrder.takerAssetAmount,
    new BigInteger(2),
  );
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

  // t.is(Number(heldInExchange), 0);
  // t.deepEqual(
  //   post.deployer.MlnToken,
  //   pre.deployer.MlnToken.minus(trade1.sellQuantity.div(2)),
  // );
  // t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(fillQuantity));
  // t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  // t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  // t.deepEqual(post.investor.ether, pre.investor.ether);
  // t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  // t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  // t.deepEqual(
  //   post.fund.MlnToken,
  //   pre.fund.MlnToken.add(trade1.sellQuantity.div(2)),
  // );
  // t.deepEqual(
  //   post.deployer.EthToken,
  //   pre.deployer.EthToken.plus(fillQuantity),
  // );
  // t.deepEqual(post.fund.ether, pre.fund.ether);
});

test('third party makes and validates an off-chain order', async () => {
  const makerAddress = s.deployer.toLowerCase();
  const mlnTokenInterface = await getToken(
    s.environment,
    s.mln.options.address,
  );
  const wethTokenInterface = await getToken(
    s.environment,
    s.weth.options.address,
  );
  const makerQuantity = createQuantity(mlnTokenInterface, 1);
  const takerQuantity = createQuantity(wethTokenInterface, 0.05);
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
  const fillQuantity = divide(
    s.signedOrder.takerAssetAmount,
    new BigInteger(2),
  );
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

  // t.is(Number(heldInExchange), 0);
  // t.deepEqual(
  //   post.deployer.MlnToken,
  //   pre.deployer.MlnToken.minus(trade1.sellQuantity.div(2)),
  // );
  // t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(fillQuantity));
  // t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  // t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  // t.deepEqual(post.investor.ether, pre.investor.ether);
  // t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  // t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  // t.deepEqual(
  //   post.fund.MlnToken,
  //   pre.fund.MlnToken.add(trade1.sellQuantity.div(2)),
  // );
  // t.deepEqual(
  //   post.deployer.EthToken,
  //   pre.deployer.EthToken.plus(fillQuantity),
  // );
  // t.deepEqual(post.fund.ether, pre.fund.ether);
});

test('Make order through the fund', async () => {
  const makerAddress = s.fund.trading.options.address.toLowerCase();
  const mlnTokenInterface = await getToken(
    s.environment,
    s.mln.options.address,
  );
  const wethTokenInterface = await getToken(
    s.environment,
    s.weth.options.address,
  );
  const makerQuantity = createQuantity(mlnTokenInterface, 0.5);
  const takerQuantity = createQuantity(wethTokenInterface, 0.05);
  const unsignedOrder = await createOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      feeRecipientAddress: s.investor,
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
  // const makerAssetAllowance = new BigNumber(
  //   await mlnToken.methods
  //     .allowance(fund.trading.options.address, erc20Proxy.options.address)
  //     .call(),
  // );
  // t.deepEqual(makerAssetAllowancqe, order.makerAssetAmount);
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
  // s.accounts = await s.environment.eth.getAccounts();
  // s.envTaker = withDifferentAccount(s.environment, s.accounts[1]);
  const result = await fillOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      signedOrder: s.signedOrder,
    },
  );
  expect(result).toBeTruthy();
  // const pre = await getAllBalances(deployed, accounts, fund);
  // const preTPFundMln = new BigNumber(
  //   await mlnToken.methods
  //     .balanceOf(thirdPartyFund.vault.options.address)
  //     .call(),
  // );
  // const preTPFundEthToken = new BigNumber(
  //   await ethToken.methods
  //     .balanceOf(thirdPartyFund.vault.options.address)
  //     .call(),
  // );
  // await fund.trading.methods
  //   .returnBatchToVault([mlnToken.options.address, ethToken.options.address])
  //   .send({ from: manager, gas: config.gas })
  // const postTPFundMln = new BigNumber(
  //   await mlnToken.methods
  //     .balanceOf(thirdPartyFund.vault.options.address)
  //     .call(),
  // );
  // const postTPFundEthToken = new BigNumber(
  //   await ethToken.methods
  //     .balanceOf(thirdPartyFund.vault.options.address)
  //     .call(),
  // );
  // const post = await getAllBalances(deployed, accounts, fund);
  // t.deepEqual(post.fund.EthToken, pre.fund.EthToken.plus(trade1.buyQuantity));
  // t.deepEqual(postTPFundEthToken, preTPFundEthToken.minus(trade1.buyQuantity));
  // t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  // t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  // t.deepEqual(post.investor.ether, pre.investor.ether);
  // t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  // t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  // t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.minus(trade1.sellQuantity));
  // t.deepEqual(postTPFundMln, preTPFundMln.plus(trade1.sellQuantity));
  // t.deepEqual(post.fund.ether, pre.fund.ether);
});

test("Fund can make another make order for same asset (After it's inactive)", async () => {
  const makerAddress = s.fund.trading.options.address.toLowerCase();
  const mlnTokenInterface = await getToken(
    s.environment,
    s.mln.options.address,
  );
  const wethTokenInterface = await getToken(
    s.environment,
    s.weth.options.address,
  );
  const makerQuantity = createQuantity(wethTokenInterface, 0.05);
  const takerQuantity = createQuantity(mlnTokenInterface, 0.5);
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
  // const makerAssetAllowance = new BigInteger(
  //   await s.mln.methods
  //     .allowance(s.fund.trading.options.address, erc20Proxy.options.address)
  //     .call(),
  // );
  expect(isOrderCancelled).toBeTruthy();
  // t.deepEqual(makerAssetAllowance, new BigNumber(0));
});
