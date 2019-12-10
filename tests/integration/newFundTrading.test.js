/*
 * @file Misc fund trading tests, iterating over the same actions
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { numberToBytes, stringToBytes } from '~/tests/utils/formatting';
import getAllBalances from '~/tests/utils/getAllBalances';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

let accounts;
let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let contracts, exchanges, deployOut;
let numberOfExchanges = 1;
let trade1, trade2;
let makeOrderSignature, takeOrderSignature, cancelOrderSignature;
let takeOrderSignatureBytes, makeOrderSignatureBytes;
let fund;
let mln, weth, oasisDex, oasisDexAdapter, version, priceSource, priceTolerance;

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

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;
  deployOut = deployed.deployOut;

  mln = contracts.MLN;
  weth = contracts.WETH;
  oasisDex = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;
  version = contracts.Version;
  priceSource = contracts.TestingPriceFeed;
  priceTolerance = contracts.PriceTolerance;

  exchanges = [oasisDex];

  const fundName = stringToBytes('Test fund', 32);
  await version.methods
    .beginSetup(
      fundName,
      [],
      [],
      [],
      [oasisDex.options.address],
      [oasisDexAdapter.options.address],
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

  expect(post.investor.weth).bigNumberEq(
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

    expect(bnPostTotalSupply).bigNumberEq(bnPreTotalSupply.add(bnWantedShares));
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
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
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
        ['0x0', '0x0', '0x0', '0x0'],
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

    expect(exchangePostMln).bigNumberEq(exchangePreMln);
    expect(exchangePostEthToken).bigNumberEq(
      exchangePreEthToken.add(bnSellQuantity),
    );
    expect(post.fund.weth).bigNumberEq(pre.fund.weth);
    expect(post.deployer.mln).bigNumberEq(pre.deployer.mln);
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

    expect(exchangePostMln).bigNumberEq(exchangePreMln);
    expect(exchangePostEthToken).bigNumberEq(
      exchangePreEthToken.sub(bnSellQuantity),
    );
    expect(post.fund.weth).bigNumberEq(
      pre.fund.weth.sub(bnSellQuantity),
    );
    expect(post.fund.mln).bigNumberEq(
      pre.fund.mln.add(bnBuyQuantity),
    );
    expect(post.deployer.weth).bigNumberEq(
      pre.deployer.weth.add(bnSellQuantity),
    );
    expect(post.deployer.mln).bigNumberEq(
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

    expect(exchangePostMln).bigNumberEq(exchangePreMln);
    expect(exchangePostEthToken).bigNumberEq(
      exchangePreEthToken.add(bnSellQuantity),
    );
    expect(post.deployer.weth).bigNumberEq(
      pre.deployer.weth.sub(bnSellQuantity),
    );
    expect(post.deployer.mln).bigNumberEq(pre.deployer.mln);
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
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [0, 0, 0, 0, 0, 0, trade2.buyQuantity, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        numberToBytes(Number(orderId), 32),
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

    expect(exchangePostMln).bigNumberEq(exchangePreMln);
    expect(exchangePostEthToken).bigNumberEq(
      exchangePreEthToken.sub(bnSellQuantity),
    );
    expect(post.deployer.mln).bigNumberEq(
      pre.deployer.mln.add(bnBuyQuantity),
    );
    expect(post.fund.mln).bigNumberEq(
      pre.fund.mln.sub(bnBuyQuantity),
    );
    expect(post.fund.weth).bigNumberEq(
      pre.fund.weth.add(bnSellQuantity),
    );
    expect(post.fund.ether).bigNumberEq(pre.fund.ether);
  });

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
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
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
        ['0x0', '0x0', '0x0', '0x0'],
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
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        numberToBytes(Number(orderId), 32),
        '0x0',
      )
      .send(managerTxOpts);

    const orderOpen = await exchanges[i].methods.isActive(orderId).call();
    const post = await getAllBalances(contracts, accounts, fund);
    const exchangePostEthToken = new BN(
      (await weth.methods.balanceOf(exchanges[i].options.address).call()).toString()
    );

    expect(orderOpen).toBeFalsy();
    expect(exchangePostEthToken).bigNumberEq(exchangePreEthToken);
    expect(post.fund.mln).bigNumberEq(pre.fund.mln);
    expect(post.fund.weth).bigNumberEq(pre.fund.weth);
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
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [0, 0, 0, 0, 0, 0, `${ bnBuyQuantity }`, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          numberToBytes(Number(orderId), 32),
          '0x0',
        )
        .send(managerTxOpts),
    ).rejects.toThrow();
  });
});
