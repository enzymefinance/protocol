const DataFeed = artifacts.require('DataFeed');
const tokens = require('../migrations/config/token_info').kovan;
const chai = require('chai');
const assert = chai.assert;

contract('DataFeed', (accounts) => {
  let feed;
  const mln = tokens.find(t => t.symbol === 'MLN-T');
  let assetA;     // eth
  let assetB;     // btc
  before('Setup contracts', async () => {
    feed = await DataFeed.new( mln.address, { from: accounts[0] });
  });
  it.skip('register asset', async () => {
    await feed.register(mln, { from: accounts[0] })
  });
  it.skip('can get assets', async () => {
    quoteAsset = await feed.getQuoteAsset();
    numAssets = await feed.numRegisteredAssets();
    assert.equal(numAssets, 2);
    assetA = await feed.getRegisteredAssetAt(0);
    assetB = await feed.getRegisteredAssetAt(1);
  });
  it.skip('registers pricefeed udpate', async () => {
    const initialUid = await feed.getLatestUpdateId();
    await feed.update([assetA, assetB], [500, 2000]);
    const newUid = await feed.getLatestUpdateId();
    assert.equal(1, newUid.toNumber() - initialUid.toNumber());
  });
  it.skip('price updates are valid', async () => {
    validA = await feed.isValid(assetA);
    validB = await feed.isValid(assetB);
    assert(validA);
    assert(validB);
  });
  it.skip('price updates are correct', async () => {
    [timeA, priceA] = await feed.getData(assetA);
    [timeB, priceB] = await feed.getData(assetB);
    priceB2 = await feed.getPrice(assetB);
    assert.equal(priceA.toNumber(), 500);
    assert.equal(priceB.toNumber(), 2000);
    assert.equal(priceB.toNumber(), priceB2.toNumber());
    assert.equal(timeA.toNumber(), timeB.toNumber());
  });
  it.skip('returns first chunk of data history for first asset', async () => {
    [timesA, pricesA] = await feed.getDataHistory(assetA, 0);
    assert.notEqual(timesA[1].toNumber(), 0);
    assert.notEqual(pricesA[1].toNumber(), 0);
  });
  it.skip('returns first chunk of data history for second asset', async () => {
    [timesB, pricesB] = await feed.getDataHistory(assetB, 0);
    assert.notEqual(timesB[1].toNumber(), 0);
    assert.notEqual(pricesB[1].toNumber(), 0);
  });
  describe('AssetRegistrar', () => {
    const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    it('registers without error', async () => {
      await feed.register(accounts[3], 'Fake token', 'LIE', 18, 'false.com',
        someBytes, accounts[5], accounts[6]); // using accts as fake addresses
    });
    it('gets descriptive information', async () => {
      [name, sym, dec, url, hash] = await feed.getDescriptiveInformation(accounts[3]);
      assert.equal(name, 'Fake token');
      assert.equal(sym, 'LIE');
      assert.equal(dec, 18);
      assert.equal(url, 'false.com');
      assert.equal(hash, someBytes);
    });
    it('gets specific information', async () => {
      [dec, , bIn, bOut] = await feed.getSpecificInformation(accounts[3]);
      assert.equal(dec, 18);
      assert.equal(bIn, accounts[5]);
      assert.equal(bOut, accounts[6]);
    });
  });
});
