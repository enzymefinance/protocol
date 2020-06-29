/*
 * @file Tests simple cases of updating price against a Kyber deployment
 *
 * @test Some unrelated account cannot update feed
 * @test Registy owner an update feed
 * @test Delegated updater can update the feed
 * @test MLN price update on reserve changes price on feed post-update
 * @test Normal spread condition from Kyber rates yields midpoint price
 * @test Crossed market condition from Kyber rates yields midpoint price
 * @test boundaries of max spread
 * @test boundaries of max price deviation
 * TODO: add helper function for updating asset prices on kyber itself
 */

import { BN, toWei } from 'web3-utils';
import { send, call } from '~/deploy/utils/deploy-contract';
import { BNExpDiv, BNExpInverse } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getEventFromLogs } from '~/tests/utils/metadata';
import { updateKyberPriceFeed, getKyberPrices } from '~/tests/utils/updateKyberPriceFeed';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, updater, someAccount;
let deployerTxOpts, updaterTxOpts, someAccountTxOpts, councilTxOpts;
let mlnPriceFromKyber;
let kyber, registry;
let dai, mln, weth, registeredPrimitives;

beforeAll(async () => {
  const defaultGas = 8000000;
  web3 = await startChain();
  [deployer, updater, someAccount] = await web3.eth.getAccounts();
  deployerTxOpts = { from: deployer, gas: defaultGas };
  updaterTxOpts = { from: updater, gas: defaultGas };
  someAccountTxOpts = { from: someAccount, gas: defaultGas };

  dai = getDeployed(CONTRACT_NAMES.DAI, web3, mainnetAddrs.tokens.DAI);
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  kyber = getDeployed(CONTRACT_NAMES.KYBER_MOCK_NETWORK, web3);

  councilTxOpts = { from: await call(registry, 'owner'), gas: defaultGas }
  registeredPrimitives = await call(registry, 'getRegisteredPrimitives');
});

describe('update', () => {
  let kyberPriceFeed;
  let pricefeedQuoteAsset;
  let maxDeviationFromFeed = toWei('0.1', 'ether');

  beforeAll(async () => {
    kyberPriceFeed = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
    pricefeedQuoteAsset = await call(kyberPriceFeed, 'PRICEFEED_QUOTE_ASSET');

    await send(
      kyberPriceFeed,
      'setMaxPriceDeviation',
      [maxDeviationFromFeed],
      deployerTxOpts,
      web3
    );

    mlnPriceFromKyber = new BN((await call(
      kyberPriceFeed, 'getLiveRate', [mln.options.address, weth.options.address]
    ))[0]);
  });

  test('Some unrelated account cannot update feed', async () => {
    const registryOwner = await call(registry, 'owner');
    const designatedUpdater = await call(kyberPriceFeed, 'updater');

    expect(registryOwner).not.toBe(someAccount);
    expect(designatedUpdater).not.toBe(someAccount);

    await expect(
      updateKyberPriceFeed(kyberPriceFeed, web3, someAccountTxOpts)
    ).rejects.toThrowFlexible('Only registry owner or updater can call');
  });

  test('Registry owner can update feed', async () => {
    const registryOwner = await call(registry, 'owner');
    expect(registryOwner).toBe(deployer);

    const livePrices = await getKyberPrices(kyberPriceFeed, registeredPrimitives);
    const receipt = await updateKyberPriceFeed(kyberPriceFeed, web3, councilTxOpts)
    const logUpdated = getEventFromLogs(receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated');

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(livePrices);
  });

  test('Designated updater can update feed', async () => {
    await expect(
      updateKyberPriceFeed(kyberPriceFeed, web3, updaterTxOpts)
    ).rejects.toThrowFlexible('Only registry owner or updater can call');

    const setUpdaterReceipt = await send(kyberPriceFeed, 'setUpdater', [updater], deployerTxOpts, web3);
    const logSetUpdater = getEventFromLogs(setUpdaterReceipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'UpdaterSet');

    expect(logSetUpdater.updater).toBe(updater);

    const livePrices = await getKyberPrices(kyberPriceFeed, registeredPrimitives);
    const updateReceipt = await updateKyberPriceFeed(kyberPriceFeed, web3, updaterTxOpts);
    const logUpdated = getEventFromLogs(updateReceipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated');

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(livePrices);

    const hasValidMlnPrice = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    const { 0: mlnPrice } = await call(kyberPriceFeed, 'getCanonicalRate', [mln.options.address, pricefeedQuoteAsset]);

    expect(hasValidMlnPrice).toBe(true);
    expect(mlnPrice.toString()).toBe(toWei('1', 'ether'));
  });

  test('Price hint above the upper deviation threshold reverts', async () => {
    const livePrices = await getKyberPrices(kyberPriceFeed, registeredPrimitives);
    const upperEndValidPrice = (new BN(livePrices[1])).mul(
      new BN(toWei('1', 'ether'))
    ).div(new BN(toWei('1', 'ether')).sub(new BN(maxDeviationFromFeed)));
    const barelyTooHighPrice = upperEndValidPrice.add(new BN('2'));

    const validSanityRates = livePrices.slice();
    validSanityRates[1] = upperEndValidPrice.toString();

    const invalidSanityRates = livePrices.slice();
    invalidSanityRates[1] = barelyTooHighPrice.toString();

    await expect(
      send(kyberPriceFeed, 'update', [registeredPrimitives,invalidSanityRates], deployerTxOpts, web3)
    ).rejects.toThrowFlexible('update: Kyber price deviates too much from maxPriceDeviation');

    const receipt = await send(kyberPriceFeed, 'update', [registeredPrimitives, validSanityRates], deployerTxOpts, web3);
    const logUpdated = getEventFromLogs(receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated');

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(livePrices);
  });

  test('Price hint below the lower deviation threshold reverts', async () => {
    const livePrices = await getKyberPrices(kyberPriceFeed, registeredPrimitives);
    const maxDeviationFromFeed = new BN(await call(kyberPriceFeed, 'maxPriceDeviation'));

    const lowerEndValidPrice = (new BN(livePrices[1])).mul(
      new BN(toWei('1', 'ether'))
    ).div(new BN(toWei('1', 'ether')).add(new BN(maxDeviationFromFeed))).add(new BN('1'));
    const barelyTooLowPrice = lowerEndValidPrice.sub(new BN('1'));

    const validSanityRates = livePrices.slice();
    validSanityRates[1] = lowerEndValidPrice.toString();

    const invalidSanityRates = livePrices.slice();
    invalidSanityRates[1] = barelyTooLowPrice.toString();

    await expect(
      send(kyberPriceFeed, 'update', [registeredPrimitives,invalidSanityRates], deployerTxOpts, web3)
    ).rejects.toThrowFlexible('update: Kyber price deviates too much from maxPriceDeviation');

    const receipt = await send(kyberPriceFeed, 'update', [registeredPrimitives, validSanityRates], deployerTxOpts, web3);
    const logUpdated = getEventFromLogs(receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated');

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(livePrices);
  });

  // TODO: need to come up with a way to set spread rates easily for this to work
  test.skip('Asset with spread greater than max results in invalid price', async () => {
    // const maxSpreadFromFeed = new BN(await call(kyberPriceFeed, 'maxSpread'));
    // // arbitrary ask rate
    // const mlnPerEthAskRate = new BN(toWei('0.5', 'ether'));
    // // bid rate such that spread is the max permitted
    // const mlnPerEthBidRateValid = mlnPerEthAskRate.sub(
    //   maxSpreadFromFeed.mul(mlnPerEthAskRate).div(new BN(toWei('1', 'ether')))
    // );
    // // bid rate such that spread is just above max permitted
    // const mlnPerEthBidRateInvalid = mlnPerEthBidRateValid.sub(new BN('1'))

    // const ethPerMlnFromAsk = BNExpDiv(
    //   new BN(toWei('1', 'ether')),
    //   mlnPerEthAskRate
    // );
    // const ethPerMlnFromBid = BNExpDiv(
    //   new BN(toWei('1', 'ether')),
    //   mlnPerEthBidRateValid
    // );
    // const midPointPrice = BNExpDiv(
    //   ethPerMlnFromAsk.add(ethPerMlnFromBid), new BN(toWei('2', 'ether'))
    // ).toString();

    // const validPricePreUpdate1 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    // expect(validPricePreUpdate1).toBe(true);

    // // setting price with spread equal to max yields valid price
    // await send(
    //   kyber,
    //   'setBaseRate',
    //   [
    //     [mln.options.address],
    //     [mlnPerEthBidRateValid.toString()],
    //     [ethPerMlnFromAsk.toString()],
    //     ['0x0000000000000000000000000000'],
    //     ['0x0000000000000000000000000000'],
    //     (await web3.eth.getBlock('latest')).number,
    //     [0]
    //   ],
    //   deployerTxOpts,
    //   web3
    // );

    // await send(
    //   kyberPriceFeed,
    //   'update',
    //   [
    //     registeredPrimitives,
    //     [toWei('1', 'ether'), midPointPrice.toString(), toWei('1', 'ether')]
    //   ],
    //   deployerTxOpts,
    //   web3
    // );

    // const validPricePostUpdate1 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    // expect(validPricePostUpdate1).toBe(true);
    // const mlnPricePostUpdate1 = (await call(
    //   kyberPriceFeed,
    //   'getCanonicalRate',
    //   [mln.options.address, pricefeedQuoteAsset]
    // ))[0];
    // expect(mlnPricePostUpdate1).toBe(midPointPrice);

    // const validPricePreUpdate2 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    // expect(validPricePreUpdate2).toBe(true);

    // // setting price with spread outside max yields invalid price
    // await send(
    //   conversionRates,
    //   'setBaseRate',
    //   [
    //     [mln.options.address],
    //     [mlnPerEthBidRateInvalid.toString()],
    //     [ethPerMlnFromAsk.toString()],
    //     ['0x0000000000000000000000000000'],
    //     ['0x0000000000000000000000000000'],
    //     (await web3.eth.getBlock('latest')).number,
    //     [0]
    //   ],
    //   deployerTxOpts,
    //   web3
    // );

    // await send(
    //   kyberPriceFeed,
    //   'update',
    //   [
    //     registeredPrimitives,
    //     [toWei('1', 'ether'), midPointPrice.toString(), toWei('1', 'ether')]
    //   ],
    //   deployerTxOpts,
    //   web3
    // );

    // const validPricePostUpdate2 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    // expect(validPricePostUpdate2).toBe(false);
  });
});

describe.only('getCanonicalRate', () => {
  let kyberPriceFeed;
  let pricefeedQuoteAsset;

  beforeAll(async () => {
    kyberPriceFeed = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
    pricefeedQuoteAsset = await call(kyberPriceFeed, 'PRICEFEED_QUOTE_ASSET');
  });

  test('Price change in kyber is reflected in getCanonicalRate post-update', async () => {
    const mlnPrice = toWei('0.6', 'ether');
    const daiPrice = toWei('0.5', 'ether');

    await send(
      kyber,
      'setRates',
      [
        [mln.options.address, dai.options.address],
        [mlnPrice.toString(), daiPrice.toString()],
        [mlnPrice.toString(), daiPrice.toString()],
      ],
      deployerTxOpts,
      web3
    );

    await updateKyberPriceFeed(kyberPriceFeed, web3)

    const { 0: updatedMlnPrice } = await call(kyberPriceFeed, 'getCanonicalRate', [mln.options.address, pricefeedQuoteAsset]);
    const { 0: updatedDaiPrice } = await call(kyberPriceFeed, 'getCanonicalRate', [dai.options.address, pricefeedQuoteAsset]);

    expect(updatedMlnPrice.toString()).toBe(mlnPrice);
    expect(updatedDaiPrice.toString()).toBe(daiPrice);
  });

  test('Normal (positive) spread condition yields midpoint price', async () => {
    const mlnBid = new BN(toWei('0.05', 'ether'));
    const mlnAsk = new BN(toWei('0.04', 'ether'));
    const midPointPrice = mlnBid.add(mlnAsk).div(new BN(2));

    await send(
      kyber,
      'setRates',
      [
        [mln.options.address],
        [mlnBid.toString()],
        [mlnAsk.toString()],
      ],
      deployerTxOpts,
      web3
    );

    await updateKyberPriceFeed(kyberPriceFeed, web3);

    const { 0: updatedMlnPrice } = (await call(kyberPriceFeed, 'getCanonicalRate', [mln.options.address, pricefeedQuoteAsset]));
    expect(updatedMlnPrice.toString()).toBe(midPointPrice.toString());
  });

  test('Crossed market condition yields midpoint price', async () => {
    const mlnBid = new BN(toWei('0.04', 'ether'));
    const mlnAsk = new BN(toWei('0.05', 'ether'));
    const midPointPrice = mlnBid.add(mlnAsk).div(new BN(2));

    // TODO: The bid/ask rate logic in MockKyberNetwork is not correct yet.

    await send(
      kyber,
      'setRates',
      [
        [mln.options.address],
        [mlnBid.toString()],
        [mlnAsk.toString()],
      ],
      deployerTxOpts,
      web3
    );

    await updateKyberPriceFeed(kyberPriceFeed, web3);

    const { 0: updatedMlnPrice } = (await call(kyberPriceFeed, 'getCanonicalRate', [mln.options.address, pricefeedQuoteAsset]));
    expect(updatedMlnPrice.toString()).toBe(midPointPrice.toString());
  });
});
