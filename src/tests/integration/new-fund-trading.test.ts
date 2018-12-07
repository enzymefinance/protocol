import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployAndGetSystem } from '~/utils/deployAndGetSystem';
import { getFundComponents } from '~/utils/getFundComponents';
import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { Contracts } from '~/Contracts';

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

  await s.version.methods
    .createComponents(
      'Test Fund',
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

  // TODO: Add back later
  // const managementFee = await deployContract('fund/fees/FixedManagementFee', { from: manager, gas: config.gas, gasPrice: config.gasPrice });
  // const performanceFee = await deployContract('fund/fees/FixedPerformanceFee', { from: manager, gas: config.gas, gasPrice: config.gasPrice });
  // await fund.feeManager.methods.batchRegister([managementFee.options.address, performanceFee.options.address]).send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });

  // Register price tolerance policy
  const priceTolerance = await deploy(
    Contracts.PriceTolerance, // TODO: go here
    [10],
  );
  await expect(
    fund.policyManager.methods
      .register(makeOrderSignatureBytes, priceTolerance.options.address)
      .send({ from: manager, gasPrice: config.gasPrice }),
  ).resolves.not.toThrow();
  await expect(
    fund.policyManager.methods
      .register(takeOrderSignatureBytes, priceTolerance.options.address)
      .send({ from: manager, gasPrice: config.gasPrice }),
  ).resolves.not.toThrow();
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

test('nothing', async () => {
  expect(true).toBe(true);
});
