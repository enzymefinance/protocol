const DataFeed = artifacts.require('DataFeed');
const Asset = artifacts.require('Asset');
const chai = require('chai');
const assert = chai.assert;

contract('DataFeed', (accounts) => {
  let feed;
  let btc;
  let eth;
  before('Setup contracts', async () => {
    btc = await Asset.new('Bitcoin Token', 'BTC-T', 18)
    eth = await Asset.new('Ether Token', 'ETH-T', 18)
    feed = await DataFeed.deployed();
  });
  describe('AssetRegistrar', () => {
    const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    it('registers twice without error', async () => {
      await feed.register(btc.address, 'Bitcoin', 'BTC', 18, 'bitcoin.org',
        someBytes, someBytes, accounts[5], accounts[6]); // accts as fake addrs
      await feed.register(eth.address, 'Ethereum', 'ETH', 18, 'ethereum.org',
        someBytes, someBytes, accounts[7], accounts[8]);
    });
    it('gets descriptive information', async () => {
      [name, sym, dec, url, hash] = await feed.getDescriptiveInformation(btc.address);
      assert.equal(name, 'Bitcoin');
      assert.equal(sym, 'BTC');
      assert.equal(dec, 18);
      assert.equal(url, 'bitcoin.org');
      assert.equal(hash, someBytes);
    });
    it('gets specific information', async () => {
      [dec, , bIn, bOut] = await feed.getSpecificInformation(btc.address);
      assert.equal(dec, 18);
      assert.equal(bIn, accounts[5]);
      assert.equal(bOut, accounts[6]);
    });
  });
  describe('DataFeed', () => {
    let assetA;
    let assetB;
    it('can get assets', async () => {
      quoteAsset = await feed.getQuoteAsset();
      numAssets = await feed.numRegisteredAssets();
      assert.equal(numAssets.toNumber(), 2);
      assetA = await feed.getRegisteredAssetAt(0);
      assetB = await feed.getRegisteredAssetAt(1);
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
    it('returns first chunk of data history for first asset', async () => {
      [timesA, pricesA] = await feed.getDataHistory(assetA, 0);
      assert.notEqual(timesA[1].toNumber(), 0);
      assert.notEqual(pricesA[1].toNumber(), 0);
    });
    it('returns first chunk of data history for second asset', async () => {
      [timesB, pricesB] = await feed.getDataHistory(assetB, 0);
      assert.notEqual(timesB[1].toNumber(), 0);
      assert.notEqual(pricesB[1].toNumber(), 0);
    });
  });
});
