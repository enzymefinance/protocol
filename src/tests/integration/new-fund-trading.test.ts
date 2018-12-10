import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployAndGetSystem } from '~/utils/deployAndGetSystem';
import { getFundComponents } from '~/utils/getFundComponents';
import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { Contracts } from '~/Contracts';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { makeOrderSignature } from '~/utils/constants/orderSignatures';
import {
  BigInteger,
  add,
  multiply,
  power,
} from '@melonproject/token-math/bigInteger';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem();
  s.addresses = addresses;
  s = Object.assign(s, contracts);

  [s.deployer, s.manager, s.investor] = s.accounts;
  s.exchanges = [s.matchingMarket]; // , matchingMarket2];
  s.gasPrice = 1;
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
    .send({ from: s.manager, gasPrice: s.gasPrice, gas: 8000000 });
  await s.version.methods
    .continueCreation()
    .send({ from: s.manager, gasPrice: s.gasPrice, gas: 8000000 });
  await s.version.methods
    .setupFund()
    .send({ from: s.manager, gasPrice: s.gasPrice, gas: 8000000 });
  const fundId = await s.version.methods.getLastFundId().call();
  const hubAddress = await s.version.methods.getFundById(fundId).call();
  s.fund = await getFundComponents(hubAddress);

  // const [, referencePrice] = Object.values(
  //     await s.priceSource.methods
  //       .getReferencePriceInfo(s.weth.options.address, s.mln.options.address)
  //       .call(),
  //   ).map(e => new BigNumber(e));
  // const [, invertedReferencePrice] = Object.values(
  //   await s.pricesSource.methods
  //     .getReferencePriceInfo(s.mln.options.address, s.weth.options.address)
  //     .call(),
  // ).map(e => new BigNumber(e));
  // const sellQuantity1 = new BigNumber(10 ** 21);
  // s.trade1 = {
  //   buyQuantity: new BigNumber(
  //     Math.floor(referencePrice.div(10 ** 18).times(sellQuantity1)),
  //   ),
  //   sellQuantity: sellQuantity1
  // };

  s.trade1 = {
    buyQuantity: 10000000000,
    sellQuantity: 100000000,
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

beforeEach(async () => {
  // runningGasTotal = new BigInteger(0);
  // await updateTestingPriceFeed(s);
  // const [, referencePrice] = Object.values(
  //   await pricefeed.methods
  //     .getReferencePriceInfo(ethToken.options.address, mlnToken.options.address)
  //     .call(),
  // ).map(e => new BigInteger(e));
  // const [, invertedReferencePrice] = Object.values(
  //   await pricefeed.methods
  //     .getReferencePriceInfo(mlnToken.options.address, ethToken.options.address)
  //     .call(),
  // ).map(e => new BigInteger(e));
  // const sellQuantity1 = new BigInteger(10 ** 21);
  // trade1 = {
  //   sellQuantity: sellQuantity1,
  //   buyQuantity: new BigInteger(
  //     Math.floor(referencePrice.div(10 ** 18).times(sellQuantity1)),
  //   ),
  // };
  // const sellQuantity2 = new BigInteger(50 * 10 ** 18);
  // trade2 = {
  //   sellQuantity: sellQuantity2,
  //   buyQuantity: new BigInteger(
  //     Math.floor(referencePrice.div(10 ** 18).times(sellQuantity2)),
  //   ),
  // };
  // const sellQuantity3 = new BigInteger(5 * 10 ** 18);
  // trade3 = {
  //   buyQuantity: new BigInteger(
  //     Math.floor(
  //       invertedReferencePrice
  //         .div(10 ** 18)
  //         .times(sellQuantity3)
  //         .div(10),
  //     ),
  //   ),
  //   sellQuantity: sellQuantity3,
  // };
  // const sellQuantity4 = new BigInteger(5 * 10 ** 18);
  // trade4 = {
  //   buyQuantity: new BigInteger(
  //     Math.floor(
  //       invertedReferencePrice
  //         .div(10 ** 18)
  //         .times(sellQuantity4)
  //         .times(1000),
  //     ),
  //   ),
  //   sellQuantity: sellQuantity4,
  // };
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
  test('Request investment', async () => {
    const wantedShares = power(new BigInteger(10), new BigInteger(20));
    await s.weth.methods
      .approve(s.fund.participation.options.address, wantedShares)
      .send({ from: s.investor, gas: 8000000 });
    await s.fund.participation.methods
      .requestInvestment(
        `${wantedShares}`,
        `${wantedShares}`,
        s.weth.options.address,
      )
      .send({ from: s.investor, gas: 8000000 });

    await updateTestingPriceFeed(s, s.environment);
    await updateTestingPriceFeed(s, s.environment);

    const totalSupply = await s.fund.shares.methods.totalSupply().call();
    await s.fund.participation.methods
      .executeRequestFor(s.investor)
      .send({ from: s.investor, gas: 8000000 });
  });

  test('Manager makes an order', async () => {
    await s.fund.trading.methods
      .callOnExchange(
        i,
        makeOrderSignature,
        [
          `${randomAddress()}`,
          `${randomAddress()}`,
          s.weth.options.address,
          s.mln.options.address,
          `${randomAddress()}`,
          `${randomAddress()}`,
        ],
        [s.trade1.sellQuantity, s.trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
        `${randomAddress()}`,
        '0x0',
        '0x0',
        '0x0',
      )
      .send({ from: s.manager, gas: 8000000 });
  });

  test('Third party takes the order', async () => {
    const orderId = await s.exchanges[i].methods.last_offer_id().call();
    // const exchangePreMln = Number(
    //   await s.mln.methods.balanceOf(s.exchanges[i].options.address).call(),
    // );
    // const exchangePreEthToken = Number(
    //   await s.weth.methods.balanceOf(s.exchanges[i].options.address).call(),
    // );
    await s.mln.methods
      .approve(s.exchanges[i].options.address, s.trade1.buyQuantity)
      .send({ from: s.deployer, gasPrice: 8000000 });
    await s.exchanges[i].methods
      .buy(orderId, s.trade1.sellQuantity)
      .send({ from: s.deployer, gas: 8000000 });
  });
});
