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
import { BN, toWei } from 'web3-utils';
import { BNExpMul } from '../utils/new/BNmath';

let environment, accounts;
let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let mlnTokenInfo, wethTokenInfo;
let contracts, exchanges;
let numberOfExchanges = 1;
let fund;
let trade1, trade2;

beforeAll(async () => {
  environment = await initTestEnvironment();
  accounts = await environment.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const system = await deployAndGetSystem(environment);
  contracts = system.contracts;

  const {
    mln,
    weth,
    matchingMarket,
    matchingMarketAdapter,
    version,
    priceSource,
    priceTolerance,
  } = contracts;

  exchanges = [matchingMarket];

  mlnTokenInfo = await getToken(environment, mln.options.address);
  wethTokenInfo = await getToken(environment, weth.options.address);
  const exchangeConfigs = {
    [Exchanges.MatchingMarket]: {
      adapter: matchingMarketAdapter.options.address,
      exchange: matchingMarket.options.address,
      takesCustody: true,
    },
  };
  const envManager = withDifferentAccount(environment, manager);
  await beginSetup(envManager, version.options.address, {
    defaultTokens: [wethTokenInfo],
    exchangeConfigs,
    fees: [],
    fundName: 'Test fund',
    quoteToken: wethTokenInfo,
  });
  await createAccounting(envManager, version.options.address);
  await createFeeManager(envManager, version.options.address);
  await createParticipation(envManager, version.options.address);
  await createPolicyManager(envManager, version.options.address);
  await createShares(envManager, version.options.address);
  await createTrading(envManager, version.options.address);
  await createVault(envManager, version.options.address);
  const hubAddress = await completeSetup(envManager, version.options.address);
  fund = await getFundComponents(envManager, hubAddress);

  await updateTestingPriceFeed(contracts, environment);
  const [referencePrice] = Object.values(
    await priceSource.methods
      .getReferencePriceInfo(weth.options.address, mln.options.address)
      .call(),
  ).map(e => new BN(e));
  const sellQuantity1 = new BN(toWei('100', 'ether'));
  trade1 = {
    buyQuantity: `${ BNExpMul(referencePrice, sellQuantity1) }`,
    sellQuantity: `${ sellQuantity1 }`,
  };

  const sellQuantity2 = new BN(toWei('.05', 'ether'));
  trade2 = {
    buyQuantity: `${ BNExpMul(referencePrice, sellQuantity2) }`,
    sellQuantity: `${ sellQuantity2 }`,
  };

  // Register price tolerance policy
  await expect(
    fund.policyManager.methods
      .register(makeOrderSignatureBytes, priceTolerance.options.address)
      .send(managerTxOpts),
  ).resolves.not.toThrow();
  await expect(
    fund.policyManager.methods
      .register(takeOrderSignatureBytes, priceTolerance.options.address)
      .send(managerTxOpts),
  ).resolves.not.toThrow();
});

test('Transfer ethToken to the investor', async () => {
  const { weth } = contracts;
  const initialTokenAmount = toWei('1000', 'ether');
  const pre = await getAllBalances(contracts, accounts, fund, environment);

  await weth.methods
    .transfer(investor, initialTokenAmount)
    .send(defaultTxOpts);

  const post = await getAllBalances(contracts, accounts, fund, environment);
  const bnInitialTokenAmount = new BN(initialTokenAmount);

  expect(post.investor.weth).toEqualBN(
    pre.investor.weth.add(bnInitialTokenAmount),
  );
});

Array.from(Array(numberOfExchanges).keys()).forEach(i => {
  test(`fund gets ETH Token from investment [round ${i + 1}]`, async () => {
    const { weth } = contracts;
    const wantedShares = toWei('100', 'ether');
    // const pre = await getAllBalances(contracts, accounts, fund, environment);
    const preTotalSupply = await fund.shares.methods.totalSupply().call();

    await weth.methods
      .approve(fund.participation.options.address, wantedShares)
      .send(investorTxOpts);
    await fund.participation.methods
      .requestInvestment(
        wantedShares,
        wantedShares,
        weth.options.address,
      )
      .send({ ...investorTxOpts, value: toWei('.1', 'ether')});

    await updateTestingPriceFeed(contracts, environment);
    await updateTestingPriceFeed(contracts, environment);

    await fund.participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    // const post = await getAllBalances(contracts, accounts, fund, environment);
    const postTotalSupply = await fund.shares.methods.totalSupply().call();
    const bnWantedShares = new BN(wantedShares);
    const bnPreTotalSupply = new BN(preTotalSupply);
    const bnPostTotalSupply = new BN(postTotalSupply);

    expect(bnPostTotalSupply).toEqualBN(bnPreTotalSupply.add(bnWantedShares));
  });

  test(`Exchange ${i +
    1}: manager makes order, sellToken sent to exchange`, async () => {
    const { mln, weth } = contracts;
    const pre = await getAllBalances(contracts, accounts, fund, environment);
    const exchangePreMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const preIsMlnInAssetList = await fund.accounting.methods
      .isInAssetList(mln.options.address)
      .call();

    await fund.trading.methods
      .callOnExchange(
        i,
        makeOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          weth.options.address,
          mln.options.address,
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [
          trade1.sellQuantity,
          trade1.buyQuantity,
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
      .send(managerTxOpts);

    const exchangePostMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const post = await getAllBalances(contracts, accounts, fund, environment);
    const postIsMlnInAssetList = await fund.accounting.methods
      .isInAssetList(mln.options.address)
      .call();
    const openOrdersAgainstMln = await fund.trading.methods
      .openMakeOrdersAgainstAsset(mln.options.address)
      .call();

    const bnSellQuantity = new BN(trade1.sellQuantity);

    expect(exchangePostMln).toEqualBN(exchangePreMln);
    expect(exchangePostEthToken).toEqualBN(
      exchangePreEthToken.add(bnSellQuantity),
    );
    expect(post.fund.weth).toEqualBN(pre.fund.weth);
    expect(post.deployer.mln).toEqualBN(pre.deployer.mln);
    expect(postIsMlnInAssetList).toBeTruthy();
    expect(preIsMlnInAssetList).toBeFalsy();
    expect(Number(openOrdersAgainstMln)).toBe(1);
  });

  test(`Exchange ${i +
    1}: anticipated taker asset is not removed from owned assets`, async () => {
    const { mln } = contracts;
    await fund.accounting.methods
      .performCalculations()
      .send(managerTxOpts);
    await fund.accounting.methods
      .updateOwnedAssets()
      .send(managerTxOpts);

    const isMlnInAssetList = await fund.accounting.methods
      .isInAssetList(mln.options.address)
      .call();

    expect(isMlnInAssetList).toBeTruthy();
  });

  test(`Exchange ${i +
    1}: third party takes entire order, allowing fund to receive mlnToken`, async () => {
    const { mln, weth } = contracts;
    const orderId = await exchanges[i].methods.last_offer_id().call();
    const pre = await getAllBalances(contracts, accounts, fund, environment);
    const exchangePreMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );

    await mln.methods
      .approve(exchanges[i].options.address, `${trade1.buyQuantity}`)
      .send(defaultTxOpts);
    await exchanges[i].methods
      .buy(orderId, `${trade1.sellQuantity}`)
      .send(defaultTxOpts);
    await fund.trading.methods
      .returnBatchToVault([mln.options.address, weth.options.address])
      .send(managerTxOpts);

    const exchangePostMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const post = await getAllBalances(contracts, accounts, fund, environment);
    const bnSellQuantity = new BN(trade1.sellQuantity);
    const bnBuyQuantity = new BN(trade1.buyQuantity);

    expect(exchangePostMln).toEqualBN(exchangePreMln);
    expect(exchangePostEthToken).toEqualBN(
      exchangePreEthToken.sub(bnSellQuantity),
    );
    expect(post.fund.weth).toEqualBN(
      pre.fund.weth.sub(bnSellQuantity),
    );
    expect(post.fund.mln).toEqualBN(
      pre.fund.mln.add(bnBuyQuantity),
    );
    expect(post.deployer.weth).toEqualBN(
      pre.deployer.weth.add(bnSellQuantity),
    );
    expect(post.deployer.mln).toEqualBN(
      pre.deployer.mln.sub(bnBuyQuantity),
    );
  });

  test(`Exchange ${i +
    // tslint:disable-next-line:max-line-length
    1}: third party makes order (sell ETH-T for MLN-T),and ETH-T is transferred to exchange`, async () => {
    const { mln, weth } = contracts;
    const pre = await getAllBalances(contracts, accounts, fund, environment);
    const exchangePreMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    await weth.methods
      .approve(exchanges[i].options.address, trade2.sellQuantity)
      .send(defaultTxOpts);

    await exchanges[i].methods
      .offer(
        trade2.sellQuantity,
        weth.options.address,
        trade2.buyQuantity,
        mln.options.address,
      )
      .send(defaultTxOpts);

    const exchangePostMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const post = await getAllBalances(contracts, accounts, fund, environment);
    const bnSellQuantity = new BN(trade2.sellQuantity);

    expect(exchangePostMln).toEqualBN(exchangePreMln);
    expect(exchangePostEthToken).toEqualBN(
      exchangePreEthToken.add(bnSellQuantity),
    );
    expect(post.deployer.weth).toEqualBN(
      pre.deployer.weth.sub(bnSellQuantity),
    );
    expect(post.deployer.mln).toEqualBN(pre.deployer.mln);
  });

  test(`Exchange ${i +
    1}: manager takes order (buys ETH-T for MLN-T)`, async () => {
    const { mln, weth } = contracts;
    const pre = await getAllBalances(contracts, accounts, fund, environment);
    const exchangePreMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePreEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const orderId = await exchanges[i].methods.last_offer_id().call();
    await fund.trading.methods
      .callOnExchange(
        i,
        takeOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          weth.options.address,
          mln.options.address,
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [0, 0, 0, 0, 0, 0, trade2.buyQuantity, 0],
        `0x${Number(orderId)
          .toString(16)
          .padStart(64, '0')}`,
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);
    const post = await getAllBalances(contracts, accounts, fund, environment);
    const exchangePostMln = new BN(
      await mln.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const exchangePostEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    const bnSellQuantity = new BN(trade2.sellQuantity);
    const bnBuyQuantity = new BN(trade2.buyQuantity);

    expect(exchangePostMln).toEqualBN(exchangePreMln);
    expect(exchangePostEthToken).toEqualBN(
      exchangePreEthToken.sub(bnSellQuantity),
    );
    expect(post.deployer.mln).toEqualBN(
      pre.deployer.mln.add(bnBuyQuantity),
    );
    expect(post.fund.mln).toEqualBN(
      pre.fund.mln.sub(bnBuyQuantity),
    );
    expect(post.fund.weth).toEqualBN(
      pre.fund.weth.add(bnSellQuantity),
    );
    expect(post.fund.ether).toEqualBN(pre.fund.ether);
  });

  test(`Exchange ${i + 1}: manager makes an order and cancels it`, async () => {
    const { mln, weth } = contracts;
    await increaseTime(environment, 60 * 30);
    const pre = await getAllBalances(contracts, accounts, fund, environment);
    const exchangePreEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );
    await fund.trading.methods
      .returnBatchToVault([mln.options.address, weth.options.address])
      .send(managerTxOpts);
    await fund.accounting.methods
      .updateOwnedAssets()
      .send(managerTxOpts);
    await fund.trading.methods
      .callOnExchange(
        i,
        makeOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          weth.options.address,
          mln.options.address,
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [
          trade2.sellQuantity,
          trade2.buyQuantity,
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
      .send(managerTxOpts);
    const orderId = await exchanges[i].methods.last_offer_id().call();
    await fund.trading.methods
      .callOnExchange(
        i,
        cancelOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          weth.options.address,
          mln.options.address,
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
      .send(managerTxOpts);

    const orderOpen = await exchanges[i].methods.isActive(orderId).call();
    const post = await getAllBalances(contracts, accounts, fund, environment);
    const exchangePostEthToken = new BN(
      await weth.methods.balanceOf(exchanges[i].options.address).call(),
    );

    expect(orderOpen).toBeFalsy();
    expect(exchangePostEthToken).toEqualBN(exchangePreEthToken);
    expect(post.fund.mln).toEqualBN(pre.fund.mln);
    expect(post.fund.weth).toEqualBN(pre.fund.weth);
  });

  test(`Exchange ${i +
    1}: Risk management prevents from taking an ill-priced order`, async () => {
    const { mln, weth } = contracts;
    const bnSellQuantity = new BN(trade2.sellQuantity);
    const bnBuyQuantity = new BN(trade2.buyQuantity);

    await weth.methods
      .approve(exchanges[i].options.address, `${trade2.sellQuantity}`)
      .send(defaultTxOpts);
    await exchanges[i].methods
      .offer(
        `${ bnSellQuantity.div(new BN(2)) }`,
        weth.options.address,
        `${ bnBuyQuantity }`,
        mln.options.address,
      )
      .send(defaultTxOpts);
    const orderId = await exchanges[i].methods.last_offer_id().call();
    await expect(
      fund.trading.methods
        .callOnExchange(
          i,
          takeOrderSignature,
          [
            randomHexOfSize(20),
            randomHexOfSize(20),
            weth.options.address,
            mln.options.address,
            randomHexOfSize(20),
            randomHexOfSize(20),
          ],
          [0, 0, 0, 0, 0, 0, `${ bnBuyQuantity }`, 0],
          `0x${Number(orderId)
            .toString(16)
            .padStart(64, '0')}`,
          '0x0',
          '0x0',
          '0x0',
        )
        .send(managerTxOpts),
    ).rejects.toThrow();
  });
});
