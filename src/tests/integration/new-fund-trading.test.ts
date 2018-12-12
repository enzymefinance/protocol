import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployAndGetSystem } from '~/utils/deployAndGetSystem';
import { getFundComponents } from '~/utils/getFundComponents';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
} from '~/utils/constants/orderSignatures';
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
  s.numberofExchanges = 1;
  s.exchanges = [s.matchingMarket];

  await s.version.methods
    .createComponents(
      'Test Fund',
      [],
      [s.matchingMarket.options.address],
      [s.matchingMarketAdapter.options.address],
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
  const [, referencePrice] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(s.weth.options.address, s.mln.options.address)
      .call(),
  ).map(e => new BigInteger(e));
  const sellQuantity1 = power(new BigInteger(10), new BigInteger(18));
  s.trade1 = {
    buyQuantity: divide(
      multiply(referencePrice, sellQuantity1),
      precisionUnits,
    ),
    sellQuantity: sellQuantity1,
  };

  const sellQuantity2 = new BigInteger(5 * 10 ** 16);
  s.trade2 = {
    buyQuantity: divide(
      multiply(referencePrice, sellQuantity2),
      precisionUnits,
    ),
    sellQuantity: sellQuantity2,
  };

  // TODO: Add back later
  // const managementFee = await deployContract('fund/fees/FixedManagementFee', { from: manager, gas: config.gas, gasPrice: config.gasPrice });
  // const performanceFee = await deployContract('fund/fees/FixedPerformanceFee', { from: manager, gas: config.gas, gasPrice: config.gasPrice });
  // await fund.feeManager.methods.batchRegister([managementFee.options.address, performanceFee.options.address]).send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });

  // Register price tolerance policy
  // const priceTolerance = await deploy(
  //   Contracts.PriceTolerance, // TODO: go here
  //   [10],
  // );
  // await expect(
  //   fund.policyManager.methods
  //     .register(makeOrderSignatureBytes, priceTolerance.options.address)
  //     .send({ from: manager, gasPrice: config.gasPrice }),
  // ).resolves.not.toThrow();
  // await expect(
  //   fund.policyManager.methods
  //     .register(takeOrderSignatureBytes, priceTolerance.options.address)
  //     .send({ from: manager, gasPrice: config.gasPrice }),
  // ).resolves.not.toThrow();
});

test('Transfer ethToken to the investor', async () => {
  const initialTokenAmount = power(new BigInteger(10), new BigInteger(21));
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  await s.weth.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send({ from: s.deployer });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  expect(post.investor.weth).toEqual(
    add(pre.investor.weth, initialTokenAmount),
  );
});

Array.from(Array(s.numberofExchanges).keys()).forEach(i => {
  test(`fund gets ETH Token from investment [round ${i + 1}]`, async () => {
    const wantedShares = power(new BigInteger(10), new BigInteger(20));
    // const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const preTotalSupply = await s.fund.shares.methods.totalSupply().call();
    await s.weth.methods
      .approve(s.fund.participation.options.address, wantedShares)
      .send({ from: s.investor, gas: s.gas });
    await s.fund.participation.methods
      .requestInvestment(
        `${wantedShares}`,
        `${wantedShares}`,
        s.weth.options.address,
      )
      .send({ from: s.investor, gas: s.gas });

    await updateTestingPriceFeed(s, s.environment);
    await updateTestingPriceFeed(s, s.environment);

    await s.fund.participation.methods
      .executeRequestFor(s.investor)
      .send({ from: s.investor, gas: s.gas });

    // const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
    expect(postTotalSupply).toEqual(add(preTotalSupply, wantedShares));
  });

  test(`Exchange ${i +
    1}: manager makes order, sellToken sent to exchange`, async () => {
    const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const exchangePreMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    await s.fund.trading.methods
      .callOnExchange(
        i,
        makeOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          s.weth.options.address,
          s.mln.options.address,
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [
          `${s.trade1.sellQuantity}`,
          `${s.trade1.buyQuantity}`,
          0,
          0,
          0,
          0,
          0,
          0,
        ],
        randomHexOfSize(20),
        '0x0',
        '0x0',
        '0x0',
      )
      .send({ from: s.manager, gas: s.gas });

    const exchangePostMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

    expect(exchangePostMln).toEqual(exchangePreMln);
    expect(exchangePostEthToken).toEqual(
      add(exchangePreEthToken, s.trade1.sellQuantity),
    );
    expect(post.fund.weth).toEqual(pre.fund.weth);
    expect(post.deployer.mln).toEqual(pre.deployer.mln);
  });

  test(`Exchange ${i +
    1}: third party takes entire order, allowing fund to receive mlnToken`, async () => {
    const orderId = await s.exchanges[i].methods.last_offer_id().call();
    const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const exchangePreMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );

    await s.mln.methods
      .approve(s.exchanges[i].options.address, `${s.trade1.buyQuantity}`)
      .send({ from: s.deployer, gasPrice: 8000000 });
    await s.exchanges[i].methods
      .buy(orderId, `${s.trade1.sellQuantity}`)
      .send({ from: s.deployer, gas: s.gas });
    await s.fund.trading.methods
      .returnBatchToVault([s.mln.options.address, s.weth.options.address])
      .send({ from: s.manager, gas: s.gas });

    const exchangePostMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

    expect(exchangePostMln).toEqual(exchangePreMln);
    expect(exchangePostEthToken).toEqual(
      subtract(exchangePreEthToken, s.trade1.sellQuantity),
    );
    expect(post.fund.weth).toEqual(
      subtract(pre.fund.weth, s.trade1.sellQuantity),
    );
    expect(post.fund.mln).toEqual(add(pre.fund.mln, s.trade1.buyQuantity));
    expect(post.deployer.weth).toEqual(
      add(pre.deployer.weth, s.trade1.sellQuantity),
    );
    expect(post.deployer.mln).toEqual(
      subtract(pre.deployer.mln, s.trade1.buyQuantity),
    );
  });

  test(`Exchange ${i +
    1}: third party makes order (sell ETH-T for MLN-T),and ETH-T is transferred to exchange`, async () => {
    const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const exchangePreMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    await s.weth.methods
      .approve(s.exchanges[i].options.address, `${s.trade2.sellQuantity}`)
      .send({ from: s.deployer, gas: s.gas });
    await s.exchanges[i].methods
      .offer(
        `${s.trade2.sellQuantity}`,
        s.weth.options.address,
        `${s.trade2.buyQuantity}`,
        s.mln.options.address,
      )
      .send({ from: s.deployer, gas: s.gas });
    const exchangePostMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

    expect(exchangePostMln).toEqual(exchangePreMln);
    expect(exchangePostEthToken).toEqual(
      add(exchangePreEthToken, s.trade2.sellQuantity),
    );
    expect(post.deployer.weth).toEqual(
      subtract(pre.deployer.weth, s.trade2.sellQuantity),
    );
    expect(post.deployer.mln).toEqual(pre.deployer.mln);
  });

  test(`Exchange ${i +
    1}: manager takes order (buys ETH-T for MLN-T)`, async () => {
    const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const exchangePreMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const orderId = await s.exchanges[i].methods.last_offer_id().call();
    await s.fund.trading.methods
      .callOnExchange(
        i,
        takeOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          randomHexOfSize(20),
          randomHexOfSize(20),
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [0, 0, 0, 0, 0, 0, `${s.trade2.buyQuantity}`, 0],
        `0x${Number(orderId)
          .toString(16)
          .padStart(64, '0')}`,
        '0x0',
        '0x0',
        '0x0',
      )
      .send({ from: s.manager, gas: s.gas });
    const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const exchangePostMln = new BigInteger(
      await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );

    expect(exchangePostMln).toEqual(exchangePreMln);
    expect(exchangePostEthToken).toEqual(
      subtract(exchangePreEthToken, s.trade2.sellQuantity),
    );
    expect(post.deployer.mln).toEqual(
      add(pre.deployer.mln, s.trade2.buyQuantity),
    );
    expect(post.fund.mln).toEqual(subtract(pre.fund.mln, s.trade2.buyQuantity));
    expect(post.fund.weth).toEqual(add(pre.fund.weth, s.trade2.sellQuantity));
    expect(post.fund.ether).toEqual(pre.fund.ether);
  });

  test(`Exchange ${i + 1}: manager makes an order and cancels it`, async () => {
    const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const exchangePreEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );
    await s.fund.trading.methods
      .returnBatchToVault([s.mln.options.address, s.weth.options.address])
      .send({ from: s.manager, gas: s.gas });
    await s.fund.accounting.methods
      .updateOwnedAssets()
      .send({ from: s.manager, gas: s.gas });
    await s.fund.trading.methods
      .callOnExchange(
        i,
        makeOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          s.weth.options.address,
          s.mln.options.address,
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [
          `${s.trade2.sellQuantity}`,
          `${s.trade2.buyQuantity}`,
          0,
          0,
          0,
          0,
          0,
          0,
        ],
        randomHexOfSize(20),
        '0x0',
        '0x0',
        '0x0',
      )
      .send({ from: s.manager, gas: s.gas });
    const orderId = await s.exchanges[i].methods.last_offer_id().call();
    await s.fund.trading.methods
      .callOnExchange(
        i,
        cancelOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          s.weth.options.address,
          s.mln.options.address,
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        `0x${Number(orderId)
          .toString(16)
          .padStart(64, '0')}`,
        '0x0',
        '0x0',
        '0x0',
      )
      .send({ from: s.manager, gas: s.gas });

    const orderOpen = await s.exchanges[i].methods.isActive(orderId).call();
    const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const exchangePostEthToken = new BigInteger(
      await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    );

    expect(orderOpen).toBeFalsy();
    expect(exchangePostEthToken).toEqual(exchangePreEthToken);
    expect(post.fund.mln).toEqual(pre.fund.mln);
    expect(post.fund.weth).toEqual(pre.fund.weth);
  });
});
