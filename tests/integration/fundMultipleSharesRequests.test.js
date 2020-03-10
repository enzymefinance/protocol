/*
 * @file Tests multiple shares requests in a fund from multiple investors
 *
 * @test A user can only have 1 pending investment at a time
 * @test A second user can simultaneously invest (with a second default token)
 * @test A third user can simultaneously invest (with a newly approved token)
 * @test Multiple pending investment requests can all be exectuted
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { delay } from '~/tests/utils/time';

let deployer, manager, investor1, investor2, investor3;
let defaultTxOpts, managerTxOpts;
let investor1TxOpts, investor2TxOpts, investor3TxOpts;

beforeAll(async () => {
  [
    deployer,
    manager,
    investor1,
    investor2,
    investor3
  ] = await getAccounts();

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investor1TxOpts = { ...defaultTxOpts, from: investor1 };
  investor2TxOpts = { ...defaultTxOpts, from: investor2 };
  investor3TxOpts = { ...defaultTxOpts, from: investor3 };
});

describe('Fund 1: Multiple investors buying shares with different tokens', () => {
  let amguAmount, shareSlippageTolerance;
  let dai, mln, weth;
  let priceSource, sharesRequestor; 
  let wantedShares1, wantedShares2, wantedShares3;
  let tokenPrices;
  let fund;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
    const contracts = deployed.contracts;
    dai = contracts.DAI;
    mln = contracts.MLN;
    weth = contracts.WETH;
    priceSource = contracts.TestingPriceFeed;
    sharesRequestor = contracts.SharesRequestor;
    const fundFactory = contracts.FundFactory;

    // Set initial prices to be predictably the same as prices when updated again later
    const wethToEthRate = toWei('1', 'ether');
    const mlnToEthRate = toWei('0.5', 'ether');
    const daiToEthRate = toWei('0.005', 'ether');
    tokenPrices = {
      addresses: [weth.options.address, mln.options.address, dai.options.address],
      prices: [wethToEthRate, mlnToEthRate, daiToEthRate]
    };
  
    await send(
      priceSource,
      'update',
      [tokenPrices.addresses, tokenPrices.prices],
      defaultTxOpts
    );

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      manager,
      quoteToken: weth.options.address,
      fundFactory
    });

    amguAmount = toWei('.01', 'ether');
    wantedShares1 = toWei('1', 'ether');
    wantedShares2 = toWei('2', 'ether');
    wantedShares3 = toWei('1.5', 'ether');
    shareSlippageTolerance = new BN(toWei('0.0001', 'ether')); // 0.01%
  });

  test('A user can have only one pending investment request', async () => {
    const { accounting, hub } = fund;

    const offerAsset = weth.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares1, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor1TxOpts
    );
    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, weth.options.address, offerAssetMaxQuantity, wantedShares1],
      { ...investor1TxOpts, value: amguAmount }
    );

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor1TxOpts
    );
    await expect(
      send(
        sharesRequestor,
        'requestShares',
        [hub.options.address, weth.options.address, offerAssetMaxQuantity, wantedShares1],
        { ...investor1TxOpts, value: amguAmount }
      )
    ).rejects.toThrowFlexible('Only one request can exist (per fund)');
  });

  test('Investment request allowed for second user with another default token', async () => {
    const { accounting, hub } = fund;

    const offerAsset = mln.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares2, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 2 - mln
    await send(mln, 'transfer', [investor2, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      mln,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor2TxOpts
    );
    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, mln.options.address, offerAssetMaxQuantity, wantedShares2],
      { ...investor2TxOpts, value: amguAmount }
    );
  });

  test('Investment request allowed for third user with approved token', async () => {
    const { accounting, hub, shares } = fund;

    const offerAsset = dai.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares3, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 3 - dai
    await send(dai, 'transfer', [investor3, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      dai,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor3TxOpts
    );

    // Investment asset must be enabled
    await expect(
      send(
        sharesRequestor,
        'requestShares',
        [hub.options.address, offerAsset, offerAssetMaxQuantity, wantedShares3],
        { ...investor3TxOpts, value: amguAmount }
      )
    ).rejects.toThrowFlexible("_investmentAsset not allowed");

    await send(shares, 'enableSharesInvestmentAssets', [[offerAsset]], managerTxOpts);

    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, offerAsset, offerAssetMaxQuantity, wantedShares3],
      { ...investor3TxOpts, value: amguAmount }
    );
  });

  test('Multiple pending investments can be executed', async () => {
    const { hub, shares } = fund;

    // Need price update before sharesRequest executed
    await delay(1000);

    await send(
      priceSource,
      'update',
      [tokenPrices.addresses, tokenPrices.prices],
      defaultTxOpts
    );

    // investor1
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor1, hub.options.address],
      investor1TxOpts
    );

    const investor1Shares = await call(shares, 'balanceOf', [investor1]);
    expect(investor1Shares).toEqual(wantedShares1);

    // investor2
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor2, hub.options.address],
      investor2TxOpts
    );
  
    const investor2Shares = await call(shares, 'balanceOf', [investor2]);
    expect(investor2Shares).toEqual(wantedShares2);

    // investor3
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor3, hub.options.address],
      investor3TxOpts
    );
  
    const investor3Shares = await call(shares, 'balanceOf', [investor3]);
    expect(investor3Shares).toEqual(wantedShares3);
  });

  test('Investor 1 buys more shares, with a different asset', async () => {
    const { accounting, hub, shares } = fund;

    const contribAmount = toWei('100', 'ether');
    const shareCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [toWei('1', 'ether'), dai.options.address]
      )
    );
    const wantedShares = BNExpDiv(new BN(contribAmount), shareCost);

    // Investor 1 - dai
    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor1]));

    await investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount,
        investor: investor1,
        tokenContract: dai
      },
      tokenPriceData: {
        priceSource,
        tokenAddresses: tokenPrices.addresses,
        tokenPrices: tokenPrices.prices
      }
    });

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor1]));
    expect(postInvestorShares).toEqual(preInvestorShares.add(new BN(wantedShares)));
  });
});
