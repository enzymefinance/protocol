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
import { BNExpDiv } from '~/tests/utils/BNmath';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { delay } from '~/tests/utils/time';
import { getDeployed } from '~/tests/utils/getDeployed';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, manager, investor1, investor2, investor3;
let defaultTxOpts;
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
  investor1TxOpts = { ...defaultTxOpts, from: investor1 };
  investor2TxOpts = { ...defaultTxOpts, from: investor2 };
  investor3TxOpts = { ...defaultTxOpts, from: investor3 };
});

describe('Fund 1: Multiple investors buying shares with different tokens', () => {
  let amguAmount;
  let weth;
  let priceSource, sharesRequestor; 
  let contribAmount1, contribAmount2, contribAmount3;
  let sharePrice, tokenPrices;
  let fund;

  beforeAll(async () => {
    weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
    priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
    sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3);
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    // Set initial prices to be predictably the same as prices when updated again later
    const wethToEthRate = toWei('1', 'ether');
    tokenPrices = {
      addresses: [weth.options.address],
      prices: [wethToEthRate]
    };
  
    await updateKyberPriceFeed(priceSource, web3);

    fund = await setupFundWithParams({
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
    contribAmount1 = toWei('1', 'ether');
    contribAmount2 = toWei('2', 'ether');
    contribAmount3 = toWei('1.5', 'ether');
    sharePrice = new BN(await call(fund.shares, 'calcSharePrice'));
  });

  test('A user can have only one pending investment request', async () => {
    const { hub } = fund;

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, contribAmount1], defaultTxOpts, web3);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, contribAmount1],
      investor1TxOpts,
      web3
    );
    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, contribAmount1, "0"],
      { ...investor1TxOpts, value: amguAmount },
      web3
    );

    // Investor 1
    await send(weth, 'transfer', [investor1, contribAmount1], defaultTxOpts, web3);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, contribAmount1],
      investor1TxOpts,
      web3
    );
    await expect(
      send(
        sharesRequestor,
        'requestShares',
        [hub.options.address, contribAmount1, "0"],
        { ...investor1TxOpts, value: amguAmount },
        web3
      )
    ).rejects.toThrowFlexible('Only one request can exist (per fund)');
  });

  test('Investment request allowed for second and third user', async () => {
    const { hub } = fund;

    // Investor 2
    await send(weth, 'transfer', [investor2, contribAmount2], defaultTxOpts, web3);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, contribAmount2],
      investor2TxOpts,
      web3
    );
    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, contribAmount2, "0"],
      { ...investor2TxOpts, value: amguAmount },
      web3
    );

    // Investor 3
    await send(weth, 'transfer', [investor3, contribAmount3], defaultTxOpts, web3);
    await send(
      weth,
      'approve',
      [sharesRequestor.options.address, contribAmount3],
      investor3TxOpts,
      web3
    );
    await send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, contribAmount3, "0"],
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

    const expectedShares1 = BNExpDiv(new BN(contribAmount1), sharePrice);
    const investor1Shares = await call(shares, 'balanceOf', [investor1]);
    expect(investor1Shares).toEqual(expectedShares1.toString());

    // investor2
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor2, hub.options.address],
      investor2TxOpts,
      web3
    );
  
    const expectedShares2 = BNExpDiv(new BN(contribAmount2), sharePrice);
    const investor2Shares = await call(shares, 'balanceOf', [investor2]);
    expect(investor2Shares).toEqual(expectedShares2.toString());

    // investor3
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor3, hub.options.address],
      investor3TxOpts,
      web3
    );
  
    const expectedShares3 = BNExpDiv(new BN(contribAmount3), sharePrice);
    const investor3Shares = await call(shares, 'balanceOf', [investor3]);
    expect(investor3Shares).toEqual(expectedShares3.toString());
  });

  test('Investor 1 buys more shares', async () => {
    const { hub, shares } = fund;

    const contribAmount = toWei('100', 'ether');
    const expectedShares = BNExpDiv(new BN(contribAmount), sharePrice);

    // Investor 1
    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor1]));

    await investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount,
        investor: investor1,
        tokenContract: weth
      },
      tokenPriceData: {
        priceSource,
        tokenAddresses: tokenPrices.addresses,
        tokenPrices: tokenPrices.prices
      },
      web3
    });

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor1]));
    expect(postInvestorShares).toEqual(preInvestorShares.add(expectedShares));
  });
});
