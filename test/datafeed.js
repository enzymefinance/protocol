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
    const someChainId = '0x86b5eed81d';
    it('registers twice without error', async () => {   // using accts as fake addrs
      await feed.register(btc.address, 'Bitcoin', 'BTC', 18, 'bitcoin.org',
        someBytes, someChainId, accounts[5], accounts[6], {from: accounts[0]});
      await feed.register(eth.address, 'Ethereum', 'ETH', 18, 'ethereum.org',
        someBytes, someBytes, accounts[7], accounts[8], {from: accounts[0]});
    });
    it.skip('gets descriptive information', async () => {
      [name, sym, url, hash] = await feed.getDescriptiveInformation(btc.address);
      assert.equal(name, 'Bitcoin');
      assert.equal(sym, 'BTC');
      assert.equal(url, 'bitcoin.org');
      assert.equal(hash, someBytes);
    });
    it.skip('gets specific information', async () => {
      [dec, chainId, bIn, bOut] = await feed.getSpecificInformation(btc.address);
      assert.equal(dec, 18);
      assert.equal(chainId, someChainId)
      assert.equal(bIn, accounts[5]);
      assert.equal(bOut, accounts[6]);
    });
  });
  describe('DataFeed', () => {
    let assetA;
    let assetB;
    it.skip('can get assets', async () => {
      quoteAsset = await feed.getQuoteAsset();
      numAssets = await feed.numRegisteredAssets();
      assert.equal(numAssets.toNumber(), 2);
      assetA = await feed.getRegisteredAssetAt(0);
      assetB = await feed.getRegisteredAssetAt(1);
    });
    it('registers pricefeed update', async () => {
      await feed.update([assetA, assetB], [500, 2000]);
      const newUid = await feed.getLastUpdateId();
      assert.equal(0, newUid.toNumber());
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
      assert.notEqual(timesA[0].toNumber(), 0);
      assert.notEqual(pricesA[0].toNumber(), 0);
    });
    it.skip('returns first chunk of data history for second asset', async () => {
      [timesB, pricesB] = await feed.getDataHistory(assetB, 0);
      assert.notEqual(timesB[0].toNumber(), 0);
      assert.notEqual(pricesB[0].toNumber(), 0);
    });
  });
});
