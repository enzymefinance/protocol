import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployAndGetSystem } from '~/tests/utils/deployAndGetSystem';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
  makeOrderSignatureBytes,
  takeOrderSignatureBytes,
} from '~/utils/constants/orderSignatures';
import {
  BigInteger,
  add,
  subtract,
  multiply,
  divide,
  power,
  toBI,
} from '@melonproject/token-math';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';
import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { Exchanges } from '~/Contracts';
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
import { increaseTime } from '~/utils/evm/increaseTime';

const precisionUnits = power(new BigInteger(10), new BigInteger(18));

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem(s.environment);
  s.addresses = addresses;
  s = Object.assign(s, contracts);

  [s.deployer, s.manager, s.investor] = s.accounts;
  s.exchanges = [s.matchingMarket];
  s.gas = 8000000;
  s.numberofExchanges = 1;
  s.exchanges = [s.matchingMarket];

  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
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
    defaultTokens: [s.wethTokenInterface],
    exchangeConfigs,
    fees: [],
    fundName: 'Test fund',
    manager: envManager.wallet.address,
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
  const [referencePrice] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(s.weth.options.address, s.mln.options.address)
      .call(),
  ).map(e => new BigInteger(e));
  const sellQuantity1 = power(new BigInteger(10), new BigInteger(20));
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

  // Register price tolerance policy
  const priceTolerance = s.priceTolerance;
  await expect(
    s.fund.policyManager.methods
      .register(makeOrderSignatureBytes, priceTolerance.options.address)
      .send({ from: s.manager }),
  ).resolves.not.toThrow();
  await expect(
    s.fund.policyManager.methods
      .register(takeOrderSignatureBytes, priceTolerance.options.address)
      .send({ from: s.manager }),
  ).resolves.not.toThrow();
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
      .send({ from: s.investor, gas: s.gas, value: '10000000000000000' });

    await updateTestingPriceFeed(s, s.environment);
    await updateTestingPriceFeed(s, s.environment);

    await s.fund.participation.methods
      .executeRequestFor(s.investor)
      .send({ from: s.investor, gas: s.gas });

    // const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
    const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
    expect(postTotalSupply).toEqual(add(toBI(preTotalSupply), wantedShares));
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
    const preIsMlnInAssetList = await s.fund.accounting.methods
      .isInAssetList(s.mln.options.address)
      .call();

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
    const postIsMlnInAssetList = await s.fund.accounting.methods
      .isInAssetList(s.mln.options.address)
      .call();
    const openOrdersAgainstMln = await s.fund.trading.methods
      .openMakeOrdersAgainstAsset(s.mln.options.address)
      .call();

    expect(exchangePostMln).toEqual(exchangePreMln);
    expect(exchangePostEthToken).toEqual(
      add(exchangePreEthToken, toBI(s.trade1.sellQuantity)),
    );
    expect(post.fund.weth).toEqual(pre.fund.weth);
    expect(post.deployer.mln).toEqual(pre.deployer.mln);
    expect(postIsMlnInAssetList).toBeTruthy();
    expect(preIsMlnInAssetList).toBeFalsy();
    expect(Number(openOrdersAgainstMln)).toEqual(1);
  });

  test(`Exchange ${i +
    1}: anticipated taker asset is not removed from owned assets`, async () => {
    await s.fund.accounting.methods
      .performCalculations()
      .send({ from: s.manager, gas: s.gas });
    await s.fund.accounting.methods
      .updateOwnedAssets()
      .send({ from: s.manager, gas: s.gas });

    const isMlnInAssetList = await s.fund.accounting.methods
      .isInAssetList(s.mln.options.address)
      .call();

    expect(isMlnInAssetList).toBeTruthy();
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
      subtract(exchangePreEthToken, toBI(s.trade1.sellQuantity)),
    );
    expect(post.fund.weth).toEqual(
      subtract(pre.fund.weth, toBI(s.trade1.sellQuantity)),
    );
    expect(post.fund.mln).toEqual(
      add(pre.fund.mln, toBI(s.trade1.buyQuantity)),
    );
    expect(post.deployer.weth).toEqual(
      add(pre.deployer.weth, toBI(s.trade1.sellQuantity)),
    );
    expect(post.deployer.mln).toEqual(
      subtract(pre.deployer.mln, toBI(s.trade1.buyQuantity)),
    );
  });

  test(`Exchange ${i +
    // tslint:disable-next-line:max-line-length
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
      add(exchangePreEthToken, toBI(s.trade2.sellQuantity)),
    );
    expect(post.deployer.weth).toEqual(
      subtract(pre.deployer.weth, toBI(s.trade2.sellQuantity)),
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
          s.weth.options.address,
          s.mln.options.address,
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
      subtract(exchangePreEthToken, toBI(s.trade2.sellQuantity)),
    );
    expect(post.deployer.mln).toEqual(
      add(pre.deployer.mln, toBI(s.trade2.buyQuantity)),
    );
    expect(post.fund.mln).toEqual(
      subtract(pre.fund.mln, toBI(s.trade2.buyQuantity)),
    );
    expect(post.fund.weth).toEqual(
      add(pre.fund.weth, toBI(s.trade2.sellQuantity)),
    );
    expect(post.fund.ether).toEqual(pre.fund.ether);
  });

  test(`Exchange ${i + 1}: manager makes an order and cancels it`, async () => {
    await increaseTime(s.environment, 60 * 30);
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

  test(`Exchange ${i +
    1}: Risk management prevents from taking an ill-priced order`, async () => {
    await s.weth.methods
      .approve(s.exchanges[i].options.address, `${s.trade2.sellQuantity}`)
      .send({ from: s.deployer, gas: s.gas });
    await s.exchanges[i].methods
      .offer(
        `${divide(s.trade2.sellQuantity, 2)}`,
        s.weth.options.address,
        `${s.trade2.buyQuantity}`,
        s.mln.options.address,
      )
      .send({ from: s.deployer, gas: s.gas });
    const orderId = await s.exchanges[i].methods.last_offer_id().call();
    await expect(
      s.fund.trading.methods
        .callOnExchange(
          i,
          takeOrderSignature,
          [
            randomHexOfSize(20),
            randomHexOfSize(20),
            s.weth.options.address,
            s.mln.options.address,
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
        .send({ from: s.manager, gas: s.gas }),
    ).rejects.toThrow();
  });
});
