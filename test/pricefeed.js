const PriceFeed = artifacts.require('PriceFeed');
const BN = require('bignumber.js');
const chai = require('chai');
const assert = chai.assert;

contract('PriceFeed', (accounts) => {
  let feed;
  let quoteAsset; // mln
  let assetA;     // eth
  let assetB;     // btc
  before('Get deployed instance', async () => {
    feed = await PriceFeed.deployed();
  });
  it('can get assets', async () => {
    quoteAsset = await feed.getQuoteAsset();
    numAssets = await feed.numDeliverableAssets();
    assert.equal(numAssets, 2);
    assetA = await feed.getDeliverableAssetAt(0);
    assetB = await feed.getDeliverableAssetAt(1);
  });
  it('registers pricefeed udpate', async () => {
    const initialUid = await feed.getLatestUpdateId();
    await feed.update([assetA, assetB], [500, 2000]);
    const newUid = await feed.getLatestUpdateId();
    assert.equal(1, newUid.toNumber() - initialUid.toNumber());
  });
  it('price updates are valid', async () => {
    validA = await feed.isValid(assetA);
    validB = await feed.isValid(assetB);
    assert(validA);
    assert(validB);
  });
  it('price updates are correct', async () => {
    [timeA, priceA] = await feed.getData(assetA);
    [timeB, priceB] = await feed.getData(assetB);
    priceB2 = await feed.getPrice(assetB);
    assert.equal(priceA.toNumber(), 500);
    assert.equal(priceB.toNumber(), 2000);
    assert.equal(priceB.toNumber(), priceB2.toNumber());
    assert.equal(timeA.toNumber(), timeB.toNumber());
  });
  it('returns first chunk of data history', async () => {
    [timesA, pricesA] = await feed.getDataHistory(assetA, 0);
    [timesB, pricesB] = await feed.getDataHistory(assetB, 0);
    assert.notEqual(timesA[1].toNumber(), 0);
    assert.notEqual(timesB[1].toNumber(), 0);
    assert.notEqual(pricesA[1].toNumber(), 0);
    assert.notEqual(pricesB[1].toNumber(), 0);
  });
});
