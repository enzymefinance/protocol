const fs = require('fs');
const environmentConfig = require('../deployment/environment.config.js');
const Web3 = require('web3');

const environment = 'development';
const config = environmentConfig[environment];
const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));

// TODO: move these test files into `test` rather than `newtest` when we remove truffle
describe('DataFeed', async () => {
  let datafeed;
  let btcToken;
  let ethToken;
  let mlnToken;
  let accounts;
  let assetA;
  let assetB;
  const inputPriceAssetA = 500;
  const inputPriceAssetB = 2000;
  let opts;
  // mock data
  let mockBreakIn;
  let mockBreakOut;
  const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // data reading functions take some time
    accounts = await web3.eth.getAccounts();
    mockBreakIn = accounts[5];
    mockBreakOut = accounts[6];
    opts = { from: accounts[0], gas: config.gas };

    let abi;
    let bytecode;
    abi = JSON.parse(fs.readFileSync('./out/assets/Asset.abi'));
    bytecode = fs.readFileSync('./out/assets/Asset.bin');
    btcToken = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: ['Bitcoin token', 'BTC-T', 18],
    }).send(opts));
    console.log('Deployed bitcoin token');

    ethToken = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: ['Ether token', 'ETH-T', 18],
    }).send(opts));
    console.log('Deployed ether token');

    mlnToken = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: ['Melon token', 'MLN-T', 18],
    }).send(opts));
    console.log('Deployed melon token');

    abi = JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi'));
    bytecode = fs.readFileSync('out/datafeeds/DataFeed.bin');
    datafeed = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [
        mlnToken.options.address,
        config.protocol.datafeed.interval,
        config.protocol.datafeed.validity
      ],
    }).send(opts));
    console.log('Deployed datafeed');
  });
  describe('AssetRegistrar', async () => {
    it('registers twice without error', async () => {   // using accts as fake addresses
      await datafeed.methods.register(
        btcToken.options.address, 'Bitcoin', 'BTC', 18, 'bitcoin.org',
        someBytes, someBytes, mockBreakIn, mockBreakOut
      ).send(opts)
      await datafeed.methods.register(
        ethToken.options.address, 'Ethereum', 'ETH', 18, 'ethereum.org',
        someBytes, someBytes, mockBreakIn, mockBreakOut
      ).send(opts);
    });
    it('gets descriptive information', async () => {
      const result = await datafeed.methods.getDescriptiveInformation(btcToken.options.address).call(opts);
      const [name, symbol, url, hash] = Object.values(result);

      expect(name).toEqual('Bitcoin');
      expect(symbol).toEqual('BTC');
      expect(url).toEqual('bitcoin.org');
      expect(hash).toEqual(someBytes);
    });
    it('gets specific information', async () => {
      const result = await datafeed.methods.getSpecificInformation(btcToken.options.address).call(opts);
      const [decimals, chainId, breakIn, breakOut] = Object.values(result);

      expect(Number(decimals)).toEqual(18);
      expect(chainId).toEqual(someBytes);
      expect(breakIn).toEqual(mockBreakIn);
      expect(breakOut).toEqual(mockBreakOut);
    });
    it('can get assets', async () => {
      const assetsRegistered = 2;
      const numAssetsResult = await datafeed.methods.numRegisteredAssets().call(opts);
      assetA = await datafeed.methods.getRegisteredAssetAt(0).call(opts);
      assetB = await datafeed.methods.getRegisteredAssetAt(1).call(opts);

      expect(Number(numAssetsResult)).toEqual(assetsRegistered);
    });
  });
  describe('DataFeed updating', async () => {
    it('registers datafeed update', async () => {
      await datafeed.methods.update(
        [assetA, assetB],
        [inputPriceAssetA, inputPriceAssetB]
      ).send(opts);
      const newUid = await datafeed.methods.getLastUpdateId().call(opts);

      expect(Number(newUid)).toEqual(0);
    });
    it('price updates are valid', async () => {
      const isValidA = await datafeed.methods.isValid(assetA).call(opts);
      const isValidB = await datafeed.methods.isValid(assetB).call(opts);

      expect(isValidA).toBe(true);
      expect(isValidB).toBe(true);
    });
    it('price updates are correct', async () => {
      let result = await datafeed.methods.getData(assetA).call(opts);
      const [timeAssetA, priceAssetA] = Object.values(result);
      result = await datafeed.methods.getData(assetB).call(opts);
      const [timeAssetB, priceAssetB] = Object.values(result);
      const getPriceResult = await datafeed.methods.getPrice(assetB).call(opts);

      expect(Number(priceAssetA)).toEqual(inputPriceAssetA);
      expect(Number(priceAssetB)).toEqual(inputPriceAssetB);
      expect(Number(priceAssetB)).toEqual(Number(getPriceResult));
      expect(Number(timeAssetA)).toEqual(Number(timeAssetB));
    });
  });
  describe('DataFeed history', async () => {
    it('returns non-empty first chunk of data history for first asset', async () => {
      const dataHistory = await datafeed.methods.getDataHistory(assetA, 0).call(opts);
      const [timesA, pricesA] = Object.values(dataHistory);

      expect(Number(timesA[0])).not.toEqual(0);
      expect(Number(pricesA[0])).not.toEqual(0);
    });
    it('returns non-empty first chunk of data history for second asset', async () => {
      const dataHistory = await datafeed.methods.getDataHistory(assetB, 0).call(opts);
      const [timesB, pricesB] = Object.values(dataHistory);

      expect(Number(timesB[0])).not.toEqual(0);
      expect(Number(pricesB[0])).not.toEqual(0);
    });
  });
});
