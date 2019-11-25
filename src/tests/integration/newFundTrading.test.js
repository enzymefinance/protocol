import { encodeFunctionSignature } from 'web3-eth-abi';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployAndGetSystem } from '~/tests/utils/deployAndGetSystem';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { getFunctionSignature } from '../utils/new/metadata';
import { CONTRACT_NAMES } from '../utils/new/constants';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { BN, toWei, padLeft, stringToHex } from 'web3-utils';
import { BNExpMul } from '../utils/new/BNmath';
const updateTestingPriceFeed = require('../utils/new/updateTestingPriceFeed');
const increaseTime = require('../utils/new/increaseTime');
const getAllBalances = require('../utils/new/getAllBalances');
const getFundComponents = require('../utils/new/getFundComponents');
const {deploy, fetchContract} = require('../../../new/deploy/deploy-contract');
const deploySystem = require('../../../new/deploy/deploy-system');
const web3 = require('../../../new/deploy/get-web3');

let accounts;
let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let contracts, exchanges, deployOut;
let numberOfExchanges = 1;
let trade1, trade2;
let makeOrderSignature, takeOrderSignature, cancelOrderSignature;
let takeOrderSignatureBytes, makeOrderSignatureBytes;
let fund;
let mln, weth, matchingMarket, matchingMarketAdapter, version, priceSource, priceTolerance;

beforeAll(async () => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
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
  makeOrderSignatureBytes = encodeFunctionSignature(
    makeOrderSignature
  );
  takeOrderSignatureBytes = encodeFunctionSignature(
    takeOrderSignature
  );

  const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
  contracts = deployment.contracts;
  deployOut = deployment.deployOut;

  mln = contracts.MLN;
  weth = contracts.WETH;
  matchingMarket = contracts.MatchingMarket;
  matchingMarketAdapter = contracts.MatchingMarketAdapter;
  version = contracts.Version;
  priceSource = contracts.TestingPriceFeed;
  priceTolerance = contracts.PriceTolerance;

  exchanges = [matchingMarket];

  const fundName = padLeft(stringToHex('Test fund'), 64);
  await version.methods
    .beginSetup(
      fundName,
      [],
      [],
      [],
      [matchingMarket.options.address],
      [matchingMarketAdapter.options.address],
      weth.options.address,
      [weth.options.address]
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

  const [referencePrice] = Object.values(
    await priceSource.methods
      .getReferencePriceInfo(weth.options.address, mln.options.address)
      .call(),
  ).map(p => new BN(p.toString()));
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
  const initialTokenAmount = toWei('1000', 'ether');
  const pre = await getAllBalances(contracts, accounts, fund);

  await weth.methods
    .transfer(investor, initialTokenAmount)
    .send(defaultTxOpts);

  const post = await getAllBalances(contracts, accounts, fund);
  const bnInitialTokenAmount = new BN(initialTokenAmount);

  expect(post.investor.weth).toEqualBN(
    pre.investor.weth.add(bnInitialTokenAmount),
  );
});

Array.from(Array(numberOfExchanges).keys()).forEach(i => {
  test(`fund gets ETH Token from investment [round ${i + 1}]`, async () => {
    const wantedShares = toWei('100', 'ether');
    // const pre = await getAllBalances(contracts, accounts, fund);
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

    await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));
    await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));

    await fund.participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    // const post = await getAllBalances(contracts, accounts, fund);
    const postTotalSupply = await fund.shares.methods.totalSupply().call();
    const bnWantedShares = new BN(wantedShares);
    const bnPreTotalSupply = new BN(preTotalSupply.toString());
    const bnPostTotalSupply = new BN(postTotalSupply.toString());

    expect(bnPostTotalSupply).toEqualBN(bnPreTotalSupply.add(bnWantedShares));
  });

  test(`Exchange ${i +
    1}: manager makes order, sellToken sent to exchange`, async () => {
    const pre = await getAllBalances(contracts, accounts, fund);
    const exchangePreMln = new BN(
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePreEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
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
        randomHexOfSize(32),
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const exchangePostMln = new BN(
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePostEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const post = await getAllBalances(contracts, accounts, fund);
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
    const orderId = await exchanges[i].methods.last_offer_id().call();
    const pre = await getAllBalances(contracts, accounts, fund);
    const exchangePreMln = new BN(
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePreEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
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
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePostEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const post = await getAllBalances(contracts, accounts, fund);
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
    const pre = await getAllBalances(contracts, accounts, fund);
    const exchangePreMln = new BN(
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePreEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
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
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePostEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const post = await getAllBalances(contracts, accounts, fund);
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
    const pre = await getAllBalances(contracts, accounts, fund);
    const exchangePreMln = new BN(
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePreEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
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
    const post = await getAllBalances(contracts, accounts, fund);
    const exchangePostMln = new BN(
      (await mln.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );
    const exchangePostEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
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

  // TODO: fix failure due to web3 2.0 RPC interface (see increaseTime.js)
  test(`Exchange ${i + 1}: manager makes an order and cancels it`, async () => {
    await increaseTime(60 * 30);
    const pre = await getAllBalances(contracts, accounts, fund);
    const exchangePreEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
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
        randomHexOfSize(32),
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
    const post = await getAllBalances(contracts, accounts, fund);
    const exchangePostEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );

    expect(orderOpen).toBeFalsy();
    expect(exchangePostEthToken).toEqualBN(exchangePreEthToken);
    expect(post.fund.mln).toEqualBN(pre.fund.mln);
    expect(post.fund.weth).toEqualBN(pre.fund.weth);
  });

  test(`Exchange ${i +
    1}: Risk management prevents from taking an ill-priced order`, async () => {
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