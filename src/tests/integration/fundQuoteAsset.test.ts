import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import {
  BigInteger,
  add,
  subtract,
  multiply,
  divide,
  power,
  toBI,
} from '@melonproject/token-math/bigInteger';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';
import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { completeSetup } from '~/contracts/factory/transactions/completeSetup';
import { createAccounting } from '~/contracts/factory/transactions/createAccounting';
import { createFeeManager } from '~/contracts/factory/transactions/createFeeManager';
import { createParticipation } from '~/contracts/factory/transactions/createParticipation';
import { createPolicyManager } from '~/contracts/factory/transactions/createPolicyManager';
import { createShares } from '~/contracts/factory/transactions/createShares';
import { createTrading } from '~/contracts/factory/transactions/createTrading';
import { createVault } from '~/contracts/factory/transactions/createVault';
import { getFundComponents } from '~/utils/getFundComponents';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { Exchanges } from '~/Contracts';
import { makeOrderSignature } from '~/utils/constants/orderSignatures';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';

const precisionUnits = power(new BigInteger(10), new BigInteger(18));

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem(s.environment);
  s.addresses = addresses;
  s = Object.assign(s, contracts);

  [s.deployer, s.manager, s.investor] = s.accounts;
  s.gas = 8000000;

  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
  s.dgxTokenInterface = await getToken(s.environment, s.dgx.options.address);
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);
  const exchangeConfigs = {
    [Exchanges.MatchingMarket]: {
      adapter: s.matchingMarketAdapter.options.address,
      exchange: s.matchingMarket.options.address,
      takesCustody: true,
    },
  };
  const envManager = withDifferentAccount(s.environment, s.manager);
  await beginSetup(envManager, s.version.options.address, {
    defaultTokens: [
      s.wethTokenInterface,
      s.mlnTokenInterface,
      s.dgxTokenInterface,
    ],
    exchangeConfigs,
    fees: [],
    fundName: 'Test fund',
    nativeToken: s.wethTokenInterface,
    priceSource: s.priceSource.options.address,
    quoteToken: s.dgxTokenInterface,
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

  await addTokenPairWhitelist(s.environment, s.matchingMarket.options.address, {
    baseToken: s.mlnTokenInterface,
    quoteToken: s.dgxTokenInterface,
  });
  await updateTestingPriceFeed(s, s.environment);
});

test('Transfer ethToken and mlnToken to the investor', async () => {
  const initialTokenAmount = power(new BigInteger(10), new BigInteger(21));
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  await s.weth.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send({ from: s.deployer });
  await s.mln.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send({ from: s.deployer });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  expect(post.investor.weth).toEqual(
    add(pre.investor.weth, initialTokenAmount),
  );
  expect(post.investor.mln).toEqual(add(pre.investor.mln, initialTokenAmount));
});

test(`fund gets non fund denomination asset from investment`, async () => {
  const wantedShares = power(new BigInteger(10), new BigInteger(20));
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
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
    .send({ from: s.investor, gas: s.gas, value: '10000000000000000' });

  const fundDenominationAsset = await s.fund.accounting.methods
    .DENOMINATION_ASSET()
    .call();
  const [dgxPriceInWeth] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, s.weth.options.address)
      .call(),
  ).map(e => new BigInteger(e));
  const expectedCostOfShares = divide(
    multiply(wantedShares, dgxPriceInWeth),
    precisionUnits,
  );
  const actualCostOfShares = new BigInteger(
    await s.fund.accounting.methods
      .getShareCostInAsset(`${wantedShares}`, s.weth.options.address)
      .call(),
  );

  await updateTestingPriceFeed(s, s.environment);
  await updateTestingPriceFeed(s, s.environment);

  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
  const postFundGav = new BigInteger(
    await s.fund.accounting.methods.calcGav().call(),
  );
  const [wethPriceInDgx] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(s.weth.options.address, fundDenominationAsset)
      .call(),
  ).map(e => new BigInteger(e));

  expect(fundDenominationAsset).toEqual(s.dgx.options.address);
  expect(postTotalSupply).toEqual(add(toBI(preTotalSupply), wantedShares));
  expect(expectedCostOfShares).toEqual(actualCostOfShares);
  expect(post.investor.weth).toEqual(
    subtract(pre.investor.weth, expectedCostOfShares),
  );
  expect(post.fund.weth).toEqual(add(pre.fund.weth, expectedCostOfShares));
  expect(postFundGav).toEqual(
    add(
      pre.fund.weth,
      divide(multiply(expectedCostOfShares, wethPriceInDgx), precisionUnits),
    ),
  );
});

test(`investor redeems his shares`, async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const investorShares = await s.fund.shares.methods
    .balanceOf(s.investor)
    .call();
  const preTotalSupply = await s.fund.shares.methods.totalSupply().call();

  await s.fund.participation.methods
    .redeem()
    .send({ from: s.investor, gas: s.gas });

  const postFundGav = new BigInteger(
    await s.fund.accounting.methods.calcGav().call(),
  );

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
  expect(postTotalSupply).toEqual(
    subtract(toBI(preTotalSupply), toBI(investorShares)),
  );
  expect(post.investor.weth).toEqual(add(pre.investor.weth, pre.fund.weth));
  expect(post.fund.weth).toEqual(new BigInteger(0));
  expect(postFundGav).toEqual(new BigInteger(0));
});

test(`fund gets non pricefeed quote asset from investment`, async () => {
  const wantedShares = power(new BigInteger(10), new BigInteger(18));
  const offeredValue = power(new BigInteger(10), new BigInteger(21));
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preFundGav = new BigInteger(
    await s.fund.accounting.methods.calcGav().call(),
  );
  const preTotalSupply = await s.fund.shares.methods.totalSupply().call();

  await s.mln.methods
    .approve(s.fund.participation.options.address, `${offeredValue}`)
    .send({ from: s.investor, gas: s.gas });
  await s.fund.participation.methods
    .requestInvestment(
      `${wantedShares}`,
      `${offeredValue}`,
      s.mln.options.address,
    )
    .send({ from: s.investor, gas: s.gas, value: '10000000000000000' });

  const fundDenominationAsset = await s.fund.accounting.methods
    .DENOMINATION_ASSET()
    .call();
  const [dgxPriceInMln] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, s.mln.options.address)
      .call(),
  ).map(e => new BigInteger(e));
  const expectedCostOfShares = divide(
    multiply(wantedShares, dgxPriceInMln),
    precisionUnits,
  );
  const actualCostOfShares = new BigInteger(
    await s.fund.accounting.methods
      .getShareCostInAsset(`${wantedShares}`, s.mln.options.address)
      .call(),
  );

  await updateTestingPriceFeed(s, s.environment);
  await updateTestingPriceFeed(s, s.environment);

  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
  const postFundGav = new BigInteger(
    await s.fund.accounting.methods.calcGav().call(),
  );
  const [mlnPriceInDgx] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(s.mln.options.address, fundDenominationAsset)
      .call(),
  ).map(e => new BigInteger(e));

  expect(fundDenominationAsset).toEqual(s.dgx.options.address);
  expect(postTotalSupply).toEqual(add(toBI(preTotalSupply), wantedShares));
  expect(expectedCostOfShares).toEqual(actualCostOfShares);
  // TODO: Fix this
  // expect(post.investor.mln).toEqual(
  //   subtract(pre.investor.mln, expectedCostOfShares),
  // );
  expect(post.fund.mln).toEqual(add(pre.fund.mln, expectedCostOfShares));
  expect(postFundGav).toEqual(
    add(
      preFundGav,
      divide(multiply(expectedCostOfShares, mlnPriceInDgx), precisionUnits),
    ),
  );
});

test(`Fund make order with a non-18 decimal asset`, async () => {
  s.trade1 = {};
  s.trade1.sellQuantity = power(new BigInteger(10), new BigInteger(8));
  await s.dgx.methods
    .transfer(s.fund.vault.options.address, `${s.trade1.sellQuantity}`)
    .send({ from: s.deployer });
  const [dgxPriceInMln] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(s.dgx.options.address, s.mln.options.address)
      .call(),
  ).map(e => new BigInteger(e));
  s.trade1.buyQuantity = divide(
    multiply(toBI(s.trade1.sellQuantity), dgxPriceInMln),
    power(new BigInteger(10), new BigInteger(9)),
  );

  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preFundCalculations = await performCalculations(
    s.environment,
    s.fund.accounting.options.address,
  );
  const exchangePreDgx = new BigInteger(
    await s.dgx.methods.balanceOf(s.matchingMarket.options.address).call(),
  );
  const exchangePreMln = new BigInteger(
    await s.mln.methods.balanceOf(s.matchingMarket.options.address).call(),
  );
  await s.fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        randomHexOfSize(20),
        randomHexOfSize(20),
        s.dgx.options.address,
        s.mln.options.address,
        randomHexOfSize(20),
        randomHexOfSize(20),
      ],
      [`${s.trade1.sellQuantity}`, `${s.trade1.buyQuantity}`, 0, 0, 0, 0, 0, 0],
      randomHexOfSize(20),
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: s.manager, gas: s.gas });

  const exchangePostDgx = new BigInteger(
    await s.dgx.methods.balanceOf(s.matchingMarket.options.address).call(),
  );
  const exchangePostMln = new BigInteger(
    await s.mln.methods.balanceOf(s.matchingMarket.options.address).call(),
  );
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postFundCalculations = await performCalculations(
    s.environment,
    s.fund.accounting.options.address,
  );

  expect(exchangePostMln).toEqual(exchangePreMln);
  expect(exchangePostDgx).toEqual(
    add(exchangePreDgx, toBI(s.trade1.sellQuantity)),
  );
  expect(post.fund.dgx).toEqual(pre.fund.dgx);
  expect(post.fund.mln).toEqual(pre.fund.mln);
  expect(postFundCalculations.gav).toEqual(preFundCalculations.gav);
  expect(postFundCalculations.sharePrice).toEqual(
    preFundCalculations.sharePrice,
  );
  expect(post.deployer.mln).toEqual(pre.deployer.mln);
});

test(`Third party takes entire order`, async () => {
  const orderId = await s.matchingMarket.methods.last_offer_id().call();
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const exchangePreMln = new BigInteger(
    await s.mln.methods.balanceOf(s.matchingMarket.options.address).call(),
  );
  const exchangePreDgx = new BigInteger(
    await s.dgx.methods.balanceOf(s.matchingMarket.options.address).call(),
  );

  await s.mln.methods
    .approve(s.matchingMarket.options.address, `${s.trade1.buyQuantity}`)
    .send({ from: s.deployer, gasPrice: 8000000 });
  await s.matchingMarket.methods
    .buy(orderId, `${s.trade1.sellQuantity}`)
    .send({ from: s.deployer, gas: s.gas });
  await s.fund.trading.methods
    .returnBatchToVault([s.mln.options.address, s.weth.options.address])
    .send({ from: s.manager, gas: s.gas });

  const exchangePostMln = new BigInteger(
    await s.mln.methods.balanceOf(s.matchingMarket.options.address).call(),
  );
  const exchangePostDgx = new BigInteger(
    await s.weth.methods.balanceOf(s.matchingMarket.options.address).call(),
  );
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(exchangePostMln).toEqual(exchangePreMln);
  expect(exchangePostDgx).toEqual(
    subtract(exchangePreDgx, toBI(s.trade1.sellQuantity)),
  );
  expect(post.fund.dgx).toEqual(
    subtract(pre.fund.dgx, toBI(s.trade1.sellQuantity)),
  );
  expect(post.fund.mln).toEqual(add(pre.fund.mln, toBI(s.trade1.buyQuantity)));
  expect(post.deployer.dgx).toEqual(
    add(pre.deployer.dgx, toBI(s.trade1.sellQuantity)),
  );
  expect(post.deployer.mln).toEqual(
    subtract(pre.deployer.mln, toBI(s.trade1.buyQuantity)),
  );
});
