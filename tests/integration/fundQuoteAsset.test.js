/*
 * @file Tests how a non-Ether ERC20 token functions as a fund's quote token
 *
 * @test A fund receives an investment that is not its quote token
 * @test An investor redeems shares made up of only the quote token
 * @test A fund receives an investment that does not have a direct pair in the pricefeed
 * @test A fund places a make order with a quote token that is not 18 decimals
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';

describe('fund-quote-asset', () => {
  let accounts;
  let deployer, manager, investor;
  let defaultTxOpts, investorTxOpts, managerTxOpts;
  let fundDenominationAsset;
  let trade1;
  let contracts, deployOut;
  let dgx, mln, weth, oasisDex, version, priceSource;
  let accounting, vault, participation, trading, shares;
  let makeOrderSignature;

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);

    contracts = deployed.contracts;
    deployOut = deployed.deployOut;
    version = contracts.Version;
    dgx = contracts.DGX;
    mln = contracts.MLN;
    weth = contracts.WETH;
    oasisDex = contracts.OasisDexExchange;
    priceSource = contracts.TestingPriceFeed;
    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    const mlnDgxAlreadyWhitelisted = await oasisDex.methods.isTokenPairWhitelisted(mln.options.address, dgx.options.address).call();
    if (!mlnDgxAlreadyWhitelisted) {
      await oasisDex.methods.addTokenPairWhitelist(mln.options.address, dgx.options.address).send(defaultTxOpts);
    }

    await version.methods
      .beginSetup(
        stringToBytes('Test fund', 32),
        [],
        [],
        [],
        [oasisDex.options.address.toString()],
        [deployOut.melon.addr.OasisDexAdapter],
        dgx.options.address.toString(),
        [
          mln.options.address.toString(),
          weth.options.address.toString(),
          dgx.options.address.toString(),
        ],
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
    const fund = await getFundComponents(hubAddress);
    accounting = fund.accounting;
    participation = fund.participation;
    shares = fund.shares;
    trading = fund.trading;
    vault = fund.vault;

    // Seed investor with MLN and WETH
    await mln.methods
      .transfer(investor, toWei('1000', 'ether'))
      .send(defaultTxOpts);
    await weth.methods
      .transfer(investor, toWei('1000', 'ether'))
      .send(defaultTxOpts);
  });

  test('Quote asset is DGX', async () => {
    fundDenominationAsset = await accounting.methods
      .DENOMINATION_ASSET()
      .call();
    expect(fundDenominationAsset).toBe(dgx.options.address);
  });

  test('Fund gets non-quote asset from investment', async () => {
    const offeredValue = toWei('100', 'ether');
    const wantedShares = toWei('100', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const dgxPriceInWeth = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, weth.options.address)
      .call())[0];

    const expectedCostOfShares = BNExpMul(
      new BN(wantedShares.toString()),
      new BN(dgxPriceInWeth.toString()),
    );

    const actualCostOfShares = new BN(
      (await accounting.methods
        .getShareCostInAsset(wantedShares, weth.options.address)
        .call()).toString(),
    );
    expect(expectedCostOfShares.eq(actualCostOfShares)).toBe(true);

    // TODO: use less fake prices
    const fakePrices = Object.values(deployOut.tokens.addr).map(() => (new BN('10')).pow(new BN('18')).toString());
    await priceSource.methods.update(Object.values(deployOut.tokens.addr), fakePrices);

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
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).add(new BN(wantedShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor.toString()).eq(
        new BN(preWethInvestor.toString()).sub(expectedCostOfShares),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFund.toString()).eq(new BN(preWethFund.toString()).add(expectedCostOfShares)),
    ).toBe(true);
    expect(
      new BN(postFundGav.toString()).eq(
        new BN(preWethFund.toString()).add(
          BNExpMul(expectedCostOfShares, new BN(wethPriceInDgx.toString())),
        ),
      ),
    ).toBe(true);
  });

  test('investor redeems his shares', async () => {
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
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).sub(new BN(investorShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor.toString()).eq(
        new BN(preWethInvestor.toString()).add(new BN(preWethFund.toString())),
      ),
    ).toBe(true);
    expect(new BN(postWethFund.toString()).eq(new BN(0))).toBe(true);
    expect(new BN(postFundGav.toString()).eq(new BN(0))).toBe(true);
  });

  test('Fund gets asset from investment that has no pair with the quote asset in the pricefeed', async () => {
    const offeredValue = toWei('1000', 'ether');
    const wantedShares = toWei('1', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const dgxPriceInMln = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, mln.options.address)
      .call())[0];
    const expectedCostOfShares = BNExpMul(
      new BN(wantedShares.toString()),
      new BN(dgxPriceInMln.toString()),
    );
    const actualCostOfShares = new BN(
      (await accounting.methods
        .getShareCostInAsset(wantedShares, mln.options.address)
        .call()).toString()
    );
    expect(expectedCostOfShares.eq(actualCostOfShares)).toBe(true);

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
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).add(new BN(wantedShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postMlnInvestor.toString()).eq(
        new BN(preMlnInvestor.toString()).sub(expectedCostOfShares),
      ),
    ).toBe(true);
    expect(
      new BN(postMlnFund.toString()).eq(new BN(preMlnFund.toString()).add(expectedCostOfShares)),
    ).toBe(true);
    expect(
      new BN(postFundGav.toString()).eq(
        new BN(preFundGav.toString()).add(
          BNExpMul(expectedCostOfShares, new BN(mlnPriceInDgx.toString())),
        ),
      ),
    ).toBe(true);
  });

  test('Fund places a make order with a non-18 decimal quote token', async () => {
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
      new BN(trade1.sellQuantity.toString()),
      new BN(dgxPriceInMln.toString()),
      9,
    ).toString();

    const preDgxExchange = await dgx.methods
      .balanceOf(oasisDex.options.address)
      .call();
    const preDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnExchange = await mln.methods
      .balanceOf(oasisDex.options.address)
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
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          dgx.options.address,
          mln.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const postDgxExchange = await dgx.methods
      .balanceOf(oasisDex.options.address)
      .call();
    const postDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnExchange = await mln.methods
      .balanceOf(oasisDex.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const postFundCalcs = await accounting.methods.performCalculations().call();

    expect(preMlnExchange).toEqual(postMlnExchange);
    expect(postMlnFund).toEqual(preMlnFund);
    expect(new BN(postDgxExchange.toString()))
      .bigNumberEq(new BN(preDgxExchange.toString()).add(new BN(trade1.sellQuantity.toString())));
    expect(new BN(postDgxFund.toString()))
      .bigNumberEq(new BN(preDgxFund.toString()).sub(new BN(trade1.sellQuantity.toString())));
    expect(postFundCalcs.gav.toString()).toBe(preFundCalcs.gav.toString());
    expect(postFundCalcs.sharePrice.toString()).toBe(preFundCalcs.sharePrice.toString());
    expect(postMlnDeployer.toString()).toBe(preMlnDeployer.toString());
  });

  test('Third party takes entire order', async () => {
    const orderId = await oasisDex.methods.last_offer_id().call();

    const preDgxDeployer = await dgx.methods.balanceOf(deployer).call();
    const preDgxExchange = await dgx.methods
      .balanceOf(oasisDex.options.address)
      .call();
    const preDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnExchange = await mln.methods
      .balanceOf(oasisDex.options.address)
      .call();
    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();

    await mln.methods
      .approve(oasisDex.options.address, trade1.buyQuantity)
      .send(defaultTxOpts);
    await oasisDex.methods
      .buy(orderId, trade1.sellQuantity)
      .send(defaultTxOpts);
    await trading.methods
      .returnBatchToVault([mln.options.address, weth.options.address])
      .send(managerTxOpts);

    const postDgxDeployer = await dgx.methods.balanceOf(deployer).call();
    const postDgxExchange = await dgx.methods
      .balanceOf(oasisDex.options.address)
      .call();
    const postDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnExchange = await mln.methods
      .balanceOf(oasisDex.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();

    expect(preMlnExchange).toEqual(postMlnExchange);
    expect(new BN(postDgxExchange.toString()))
      .bigNumberEq(new BN(preDgxExchange.toString()).sub(new BN(trade1.sellQuantity.toString())));
    expect(postDgxFund.toString()).toBe(preDgxFund.toString());
    expect(new BN(postMlnFund.toString()))
      .bigNumberEq(new BN(preMlnFund.toString()).add(new BN(trade1.buyQuantity.toString())));
    expect(new BN(postDgxDeployer.toString()))
      .bigNumberEq(new BN(preDgxDeployer.toString()).add(new BN(trade1.sellQuantity.toString())));
    expect(new BN(postMlnDeployer.toString()))
      .bigNumberEq(new BN(preMlnDeployer.toString()).sub(new BN(trade1.buyQuantity.toString())));
  });
});
