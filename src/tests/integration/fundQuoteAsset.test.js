import { BN, toWei, randomHex } from 'web3-utils';

import { getFunctionSignature } from '../utils/new/metadata';
import { CONTRACT_NAMES } from '../utils/new/constants';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { getFundComponents } from '~/utils/getFundComponents';
import { stringToBytes } from '../utils/new/formatting';
import { BNExpMul } from '../utils/new/BNmath';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';

describe('fund-quote-asset', () => {
  let environment, accounts;
  let deployer, manager, investor;
  let defaultTxOpts, investorTxOpts, managerTxOpts;
  let addresses, contracts;
  let fundDenominationAsset;
  let trade1;
  let makeOrderSignature;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    accounts = await environment.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    const system = await deployAndGetSystem(environment);
    addresses = system.addresses;
    contracts = system.contracts;

    const {
      dgx,
      matchingMarketAdapter,
      matchingMarket,
      version: fundFactory,
      weth,
      mln,
    } = contracts;

    await fundFactory.methods
      .beginSetup(
        stringToBytes('Test fund', 32),
        [],
        [],
        [],
        [matchingMarket.options.address.toString()],
        [matchingMarketAdapter.options.address.toString()],
        dgx.options.address.toString(),
        [
          mln.options.address.toString(),
          weth.options.address.toString(),
          dgx.options.address.toString(),
        ],
      )
      .send(managerTxOpts);
    await fundFactory.methods.createAccounting().send(managerTxOpts);
    await fundFactory.methods.createFeeManager().send(managerTxOpts);
    await fundFactory.methods.createParticipation().send(managerTxOpts);
    await fundFactory.methods.createPolicyManager().send(managerTxOpts);
    await fundFactory.methods.createShares().send(managerTxOpts);
    await fundFactory.methods.createTrading().send(managerTxOpts);
    await fundFactory.methods.createVault().send(managerTxOpts);
    const res = await fundFactory.methods.completeSetup().send(managerTxOpts);
    const hubAddress = res.events.NewFund.returnValues.hub;

    const envManager = withDifferentAccount(environment, manager);
    contracts.fund = await getFundComponents(envManager, hubAddress);

    await matchingMarket.methods
      .addTokenPairWhitelist(
        dgx.options.address.toString(),
        mln.options.address.toString(),
      )
      .send(defaultTxOpts);

    await updateTestingPriceFeed(contracts, environment);
  });

  test('fund denomination asset is dgx', async () => {
    const { dgx } = contracts;
    const { accounting } = contracts.fund;

    fundDenominationAsset = await accounting.methods
      .DENOMINATION_ASSET()
      .call();
    expect(fundDenominationAsset).toBe(dgx.options.address);
  });

  test('Transfer ethToken and mlnToken to the investor', async () => {
    const { mln, weth } = contracts;
    const initialTokenAmount = toWei('1000', 'ether');

    const preMlnInvestor = await mln.methods.balanceOf(investor).call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    await mln.methods
      .transfer(investor, initialTokenAmount)
      .send(defaultTxOpts);
    await weth.methods
      .transfer(investor, initialTokenAmount)
      .send(defaultTxOpts);
    const postMlnInvestor = await mln.methods.balanceOf(investor).call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();

    expect(
      new BN(postMlnInvestor).eq(
        new BN(preMlnInvestor).add(new BN(initialTokenAmount)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).add(new BN(initialTokenAmount)),
      ),
    ).toBe(true);
  });

  test(`fund gets non fund denomination asset from investment`, async () => {
    const { dgx, priceSource, weth } = contracts;
    const { accounting, participation, shares, vault } = contracts.fund;
    const offeredValue = toWei('100', 'ether');
    const wantedShares = toWei('100', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const dgxPriceInWeth = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, weth.options.address)
      .call())[0];

    const expectedCostOfShares = BNExpMul(
      new BN(wantedShares),
      new BN(dgxPriceInWeth),
    );

    const actualCostOfShares = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares, weth.options.address)
        .call(),
    );
    expect(expectedCostOfShares.eq(actualCostOfShares)).toBe(true);

    await updateTestingPriceFeed(contracts, environment);

    const preWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await weth.methods
      .approve(participation.options.address, wantedShares)
      .send(investorTxOpts);

    await participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    const wethPriceInDgx = (await priceSource.methods
      .getReferencePriceInfo(weth.options.address, fundDenominationAsset)
      .call())[0];

    expect(
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply).add(new BN(wantedShares)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).sub(expectedCostOfShares),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFund).eq(new BN(preWethFund).add(expectedCostOfShares)),
    ).toBe(true);
    expect(
      new BN(postFundGav).eq(
        new BN(preWethFund).add(
          BNExpMul(expectedCostOfShares, new BN(wethPriceInDgx)),
        ),
      ),
    ).toBe(true);
  });

  test(`investor redeems his shares`, async () => {
    const { weth } = contracts;
    const { accounting, participation, shares, vault } = contracts.fund;

    const investorShares = await shares.methods.balanceOf(investor).call();

    const preWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await participation.methods.redeem().send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    expect(
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply).sub(new BN(investorShares)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).add(new BN(preWethFund)),
      ),
    ).toBe(true);
    expect(new BN(postWethFund).eq(new BN(0))).toBe(true);
    expect(new BN(postFundGav).eq(new BN(0))).toBe(true);
  });

  test(`fund gets non pricefeed quote asset from investment`, async () => {
    const { dgx, mln, priceSource } = contracts;
    const { accounting, participation, shares, vault } = contracts.fund;
    const offeredValue = toWei('1000', 'ether');
    const wantedShares = toWei('1', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const dgxPriceInMln = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, mln.options.address)
      .call())[0];
    const expectedCostOfShares = BNExpMul(
      new BN(wantedShares),
      new BN(dgxPriceInMln),
    );
    const actualCostOfShares = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares, mln.options.address)
        .call(),
    );
    expect(expectedCostOfShares.eq(actualCostOfShares)).toBe(true);

    await updateTestingPriceFeed(contracts, environment);

    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnInvestor = await mln.methods.balanceOf(investor).call();
    const preFundGav = await accounting.methods.calcGav().call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await mln.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);
    await participation.methods
      .requestInvestment(wantedShares, offeredValue, mln.options.address)
      .send({ ...investorTxOpts, value: amguAmount });
    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnInvestor = await mln.methods.balanceOf(investor).call();
    const postFundGav = await accounting.methods.calcGav().call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const mlnPriceInDgx = (await priceSource.methods
      .getReferencePriceInfo(mln.options.address, fundDenominationAsset)
      .call())[0];

    expect(
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply).add(new BN(wantedShares)),
      ),
    ).toBe(true);
    expect(
      new BN(postMlnInvestor).eq(
        new BN(preMlnInvestor).sub(expectedCostOfShares),
      ),
    ).toBe(true);
    expect(
      new BN(postMlnFund).eq(new BN(preMlnFund).add(expectedCostOfShares)),
    ).toBe(true);
    expect(
      new BN(postFundGav).eq(
        new BN(preFundGav).add(
          BNExpMul(expectedCostOfShares, new BN(mlnPriceInDgx)),
        ),
      ),
    ).toBe(true);
  });

  test(`Fund make order with a non-18 decimal asset`, async () => {
    const { dgx, matchingMarket, mln, priceSource } = contracts;
    const { accounting, trading, vault } = contracts.fund;
    const wantedShares = toWei('1', 'ether');
    trade1 = {
      sellQuantity: toWei('0.1', 'gwei'),
    };

    await dgx.methods
      .transfer(vault.options.address, trade1.sellQuantity)
      .send(defaultTxOpts);

    const dgxPriceInMln = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, mln.options.address)
      .call())[0];
    trade1.buyQuantity = BNExpMul(
      new BN(trade1.sellQuantity),
      new BN(dgxPriceInMln),
      9,
    ).toString();

    const preDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const preFundCalcs = await accounting.methods.performCalculations().call();

    await trading.methods
      .callOnExchange(
        0,
        makeOrderSignature,
        [
          randomHex(20),
          randomHex(20),
          dgx.options.address,
          mln.options.address,
          randomHex(20),
          randomHex(20),
        ],
        [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
        randomHex(20),
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const postDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const postFundCalcs = await accounting.methods.performCalculations().call();

    expect(preMlnExchange).toBe(postMlnExchange);
    expect(postMlnFund).toBe(preMlnFund);
    expect(new BN(postDgxExchange))
      .toEqualBN(new BN(preDgxExchange).add(new BN(trade1.sellQuantity)));
    expect(new BN(postDgxFund))
      .toEqualBN(new BN(preDgxFund).sub(new BN(trade1.sellQuantity)));
    expect(postFundCalcs.gav).toBe(preFundCalcs.gav);
    expect(postFundCalcs.sharePrice).toBe(preFundCalcs.sharePrice);
    expect(postMlnDeployer).toBe(preMlnDeployer);
  });

  test(`Third party takes entire order`, async () => {
    const { dgx, matchingMarket, mln, weth } = contracts;
    const { trading, vault } = contracts.fund;
    const orderId = await matchingMarket.methods.last_offer_id().call();

    const preDgxDeployer = await dgx.methods.balanceOf(deployer).call();
    const preDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();

    await mln.methods
      .approve(matchingMarket.options.address, trade1.buyQuantity)
      .send(defaultTxOpts);
    await matchingMarket.methods
      .buy(orderId, trade1.sellQuantity)
      .send(defaultTxOpts);
    await trading.methods
      .returnBatchToVault([mln.options.address, weth.options.address])
      .send(managerTxOpts);

    const postDgxDeployer = await dgx.methods.balanceOf(deployer).call();
    const postDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();

    expect(preMlnExchange).toBe(postMlnExchange);
    expect(new BN(postDgxExchange))
      .toEqualBN(new BN(preDgxExchange).sub(new BN(trade1.sellQuantity)));
    expect(postDgxFund).toBe(preDgxFund);
    expect(new BN(postMlnFund))
      .toEqualBN(new BN(preMlnFund).add(new BN(trade1.buyQuantity)));
    expect(new BN(postDgxDeployer))
      .toEqualBN(new BN(preDgxDeployer).add(new BN(trade1.sellQuantity)));
    expect(new BN(postMlnDeployer))
      .toEqualBN(new BN(preMlnDeployer).sub(new BN(trade1.buyQuantity)));
  });
});
