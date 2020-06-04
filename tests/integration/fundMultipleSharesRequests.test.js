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
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { delay } from '~/tests/utils/time';
import { getDeployed } from '~/tests/utils/getDeployed';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, manager, investor1, investor2, investor3;
let defaultTxOpts, managerTxOpts;
let investor1TxOpts, investor2TxOpts, investor3TxOpts;

beforeAll(async () => {
  web3 = await startChain();
  [
    deployer,
    manager,
    investor1,
    investor2,
    investor3
  ] = await web3.eth.getAccounts();

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investor1TxOpts = { ...defaultTxOpts, from: investor1 };
  investor2TxOpts = { ...defaultTxOpts, from: investor2 };
  investor3TxOpts = { ...defaultTxOpts, from: investor3 };
});

describe('Fund 1: Multiple investors buying shares with different tokens', () => {
  let amguAmount, shareSlippageTolerance;
  let zrx, mln, weth;
  let priceSource, sharesRequestor; 
  let wantedShares1, wantedShares2, wantedShares3;
  let tokenPrices;
  let fund;

  beforeAll(async () => {
    zrx = getDeployed(CONTRACT_NAMES.ZRX, web3, mainnetAddrs.tokens.ZRX);
    weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
    mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
    priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
    sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3);
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    // Set initial prices to be predictably the same as prices when updated again later
    const wethToEthRate = toWei('1', 'ether');
    const mlnToEthRate = toWei('0.5', 'ether');
    const zrxToEthRate = toWei('0.005', 'ether');
    tokenPrices = {
      addresses: [weth.options.address, mln.options.address, zrx.options.address],
      prices: [wethToEthRate, mlnToEthRate, zrxToEthRate]
    };
  
    await updateKyberPriceFeed(priceSource, web3);

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      manager,
      quoteToken: weth.options.address,
      fundFactory,
      web3
    });

    amguAmount = toWei('.01', 'ether');
    wantedShares1 = toWei('1', 'ether');
    wantedShares2 = toWei('2', 'ether');
    wantedShares3 = toWei('1.5', 'ether');
    shareSlippageTolerance = new BN(toWei('0.0001', 'ether')); // 0.01%
  });

  test('A user can have only one pending investment request', async () => {
    const { hub, shares } = fund;

    const offerAsset = weth.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        shares,
        'getSharesCostInAsset',
        [wantedShares1, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, offerAssetMaxQuantity], defaultTxOpts, web3);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor1TxOpts,
      web3
    );
    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, weth.options.address, offerAssetMaxQuantity, wantedShares1],
      { ...investor1TxOpts, value: amguAmount },
      web3
    );

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, offerAssetMaxQuantity], defaultTxOpts, web3);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor1TxOpts,
      web3
    );
    await expect(
      send(
        sharesRequestor,
        'requestShares',
        [hub.options.address, weth.options.address, offerAssetMaxQuantity, wantedShares1],
        { ...investor1TxOpts, value: amguAmount },
        web3
      )
    ).rejects.toThrowFlexible('Only one request can exist (per fund)');
  });

  test('Investment request allowed for second user with another default token', async () => {
    const { hub, shares } = fund;

    const offerAsset = mln.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        shares,
        'getSharesCostInAsset',
        [wantedShares2, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 2 - mln
    await send(mln, 'transfer', [investor2, offerAssetMaxQuantity], defaultTxOpts, web3);
    await send(
      mln,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor2TxOpts,
      web3
    );
    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, mln.options.address, offerAssetMaxQuantity, wantedShares2],
      { ...investor2TxOpts, value: amguAmount },
      web3
    );
  });

  test('Investment request allowed for third user with approved token', async () => {
    const { hub, shares } = fund;

    const offerAsset = zrx.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        shares,
        'getSharesCostInAsset',
        [wantedShares3, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 3 - zrx
    await send(zrx, 'transfer', [investor3, offerAssetMaxQuantity], defaultTxOpts, web3);
    await send(
      zrx,
      'approve',
      [sharesRequestor.options.address, offerAssetMaxQuantity],
      investor3TxOpts,
      web3
    );

    // Investment asset must be enabled
    await expect(
      send(
        sharesRequestor,
        'requestShares',
        [hub.options.address, offerAsset, offerAssetMaxQuantity, wantedShares3],
        { ...investor3TxOpts, value: amguAmount },
        web3
      )
    ).rejects.toThrowFlexible("_investmentAsset not allowed");

    await send(shares, 'enableSharesInvestmentAssets', [[offerAsset]], managerTxOpts, web3);

    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, offerAsset, offerAssetMaxQuantity, wantedShares3],
      { ...investor3TxOpts, value: amguAmount },
      web3
    );
  });

  test('Multiple pending investments can be executed', async () => {
    const { hub, shares } = fund;

    // Need price update before sharesRequest executed
    await delay(1000);
    await updateKyberPriceFeed(priceSource, web3);

    // investor1
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor1, hub.options.address],
      investor1TxOpts,
      web3
    );

    const investor1Shares = await call(shares, 'balanceOf', [investor1]);
    expect(investor1Shares).toEqual(wantedShares1);

    // investor2
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor2, hub.options.address],
      investor2TxOpts,
      web3
    );
  
    const investor2Shares = await call(shares, 'balanceOf', [investor2]);
    expect(investor2Shares).toEqual(wantedShares2);

    // investor3
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor3, hub.options.address],
      investor3TxOpts,
      web3
    );
  
    const investor3Shares = await call(shares, 'balanceOf', [investor3]);
    expect(investor3Shares).toEqual(wantedShares3);
  });

  test('Investor 1 buys more shares, with a different asset', async () => {
    const { hub, shares } = fund;

    const contribAmount = toWei('100', 'ether');
    const shareCost = new BN(
      await call(
        shares,
        'getSharesCostInAsset',
        [toWei('1', 'ether'), zrx.options.address]
      )
    );
    const wantedShares = BNExpDiv(new BN(contribAmount), shareCost);

    // Investor 1 - zrx
    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor1]));

    await investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount,
        investor: investor1,
        tokenContract: zrx
      },
      tokenPriceData: {
        priceSource,
        tokenAddresses: tokenPrices.addresses,
        tokenPrices: tokenPrices.prices
      },
      web3
    });

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor1]));
    expect(postInvestorShares).toEqual(preInvestorShares.add(new BN(wantedShares)));
  });
});
