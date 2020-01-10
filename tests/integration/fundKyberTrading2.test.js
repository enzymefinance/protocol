/*
 * @file Tests fund trading on Kyber
 *
 * @test A fund takes an order
 * @test Price tolerance policy prevents too much slippage
 * TODO: refactor into `fundKyberTrading`
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';

import { BNExpMul, BNExpInverse } from '~/tests/utils/BNmath';
import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
  KYBER_ETH_ADDRESS,
  TRACKS,
} from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import setupInvestedTestFund from '~/tests/utils/setupInvestedTestFund';

describe('Happy Path', () => {
  let user, defaultTxOpts;
  let mln, weth;
  let fund;
  let accounting, trading, policyManager;
  let kyberNetworkProxy, conversionRates, priceTolerance;
  let testingPriceFeed;
  let exchangeIndex;
  let takeOrderFunctionSig;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = {from: user, gas: 8000000};

    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;

    fund = await setupInvestedTestFund(contracts, user);

    weth = contracts.WETH;
    mln = contracts.MLN;
    kyberNetworkProxy = contracts.KyberNetworkProxy;
    conversionRates = contracts.ConversionRates;
    testingPriceFeed = contracts.TestingPriceFeed;
    priceTolerance = contracts.PriceTolerance;
    policyManager = fund.policyManager;
    trading = fund.trading;
    accounting = fund.accounting;

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === contracts.KyberAdapter.options.address.toLowerCase()
    );

    takeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );

    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        priceTolerance.options.address
      )
      .send(defaultTxOpts);

    // Setting rates on kyber reserve
    const { 0: mlnPrice } = await testingPriceFeed.methods
      .getPrice(mln.options.address)
      .call();
    const ethPriceInMln = BNExpInverse(new BN(mlnPrice.toString())).toString()

    const blockNumber = (await web3.eth.getBlock('latest')).number;

    await conversionRates.methods
      .setBaseRate(
        [mln.options.address],
        [ethPriceInMln],
        [mlnPrice],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0],
      )
      .send(defaultTxOpts);
  });

  test('Trade on kyber', async () => {
    const takerAsset = weth.options.address;
    const takerQuantity = toWei('0.1', 'ether');

    const { 1: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(KYBER_ETH_ADDRESS, mln.options.address, takerQuantity)
      .call(defaultTxOpts);

    // Minimum quantity of dest asset expected to get in return in the trade
    const makerAsset = mln.options.address;
    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(expectedRate.toString()),
    ).toString();

    const preMlnBalance = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderFunctionSig,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0',
      )
      .send(defaultTxOpts);

    const postMlnBalance = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();

    const mlnBalanceDiff = new BN(postMlnBalance.toString()).sub(new BN(preMlnBalance.toString()));
    expect(mlnBalanceDiff.gt(new BN(makerQuantity))).toBe(true);

    const holdingsRes = await accounting.methods.getFundHoldings().call();
    const holdings = holdingsRes[1].map((address, i) => {
      return { address, value: holdingsRes[0][i] };
    });

    const wethHolding = holdings.find(
      holding => holding.address === weth.options.address,
    );
    expect(
      new BN(wethHolding.value.toString())
        .add(new BN(takerQuantity.toString()))
        .eq(new BN(toWei('1', 'ether'))),
    ).toBe(true);
  });

  test('Price tolerance prevents ill priced trade', async () => {
    const takerAsset = weth.options.address;
    const takerQuantity = toWei('0.1', 'ether');

    // Minimum quantity of dest asset expected to get in return in the trade
    const makerAsset = mln.options.address;
    const makerQuantity = '0';

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderFunctionSig,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(defaultTxOpts),
    ).rejects.toThrow('Rule evaluated to false: PriceTolerance');
  });
});
