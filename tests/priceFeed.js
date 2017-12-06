import Api from "@parity/api";

const fs = require("fs");
const environmentConfig = require("../utils/config/environmentConfig.js");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// TODO: move these test files into `test` rather than `newtest` when we remove truffle
describe("PriceFeed", async () => {
  let datafeed;
  let datafeedContract;
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
  const someBytes =
    "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // data reading functions take some time
    accounts = await api.eth.accounts();
    mockBreakIn = accounts[5];
    mockBreakOut = accounts[6];
    opts = { from: accounts[0], gas: config.gas };

    let abi;
    let bytecode;
    abi = JSON.parse(fs.readFileSync("./out/assets/Asset.abi"));
    bytecode = fs.readFileSync("./out/assets/Asset.bin");
    opts.data = `0x${bytecode}`;
    btcToken = await api
      .newContract(abi)
      .deploy(opts, ["Bitcoin token", "BTC-T", 18]);
    console.log("Deployed bitcoin token");

    ethToken = await api
      .newContract(abi)
      .deploy(opts, ["Ether token", "ETH-T", 18]);
    console.log("Deployed ether token");

    mlnToken = await api
      .newContract(abi)
      .deploy(opts, ["Melon token", "MLN-T", 18]);
    console.log("Deployed melon token");

    abi = JSON.parse(fs.readFileSync("out/pricefeeds/PriceFeed.abi"));
    bytecode = fs.readFileSync("out/pricefeeds/PriceFeed.bin");
    opts.data = `0x${bytecode}`;
    datafeed = await api
      .newContract(abi)
      .deploy(opts, [
        mlnToken,
        config.protocol.datafeed.interval,
        config.protocol.datafeed.validity,
      ]);
    datafeedContract = await api.newContract(abi, datafeed);
    console.log("Deployed datafeed");
  });

  describe("AssetRegistrar", async () => {
    it("registers twice without error", async () => {
      // using accts as fake addresses
      await datafeedContract.instance.register.postTransaction(opts, [
        btcToken,
        "Bitcoin",
        "BTC",
        18,
        "bitcoin.org",
        someBytes,
        someBytes,
        mockBreakIn,
        mockBreakOut,
      ]);
      await datafeedContract.instance.register.postTransaction(opts, [
        ethToken,
        "Ethereum",
        "ETH",
        18,
        "ethereum.org",
        someBytes,
        someBytes,
        mockBreakIn,
        mockBreakOut,
      ]);
    });

    it("gets descriptive information", async () => {
      const result = await datafeedContract.instance.getDescriptiveInformation.call(
        opts,
        [btcToken],
      );
      const [name, symbol, url, hash] = Object.values(result);

      expect(name).toEqual("Bitcoin");
      expect(symbol).toEqual("BTC");
      expect(url).toEqual("bitcoin.org");
      expect(hash).toEqual(someBytes);
    });

    it("gets specific information", async () => {
      const result = await datafeedContract.instance.getSpecificInformation.call(
        opts,
        [btcToken],
      );
      const [decimals, chainId, breakIn, breakOut] = Object.values(result);

      expect(Number(decimals)).toEqual(18);
      expect(chainId).toEqual(someBytes);
      expect(breakIn).toEqual(mockBreakIn);
      expect(breakOut).toEqual(mockBreakOut);
    });

    it("can get assets", async () => {
      const assetsRegistered = 2;
      const numAssetsResult = await datafeedContract.instance.numRegisteredAssets.call(
        opts,
        [],
      );
      assetA = await datafeedContract.instance.getRegisteredAssetAt.call(opts, [
        0,
      ]);
      assetB = await datafeedContract.instance.getRegisteredAssetAt.call(opts, [
        1,
      ]);

      expect(Number(numAssetsResult)).toEqual(assetsRegistered);
    });
  });

  describe("PriceFeed updating", async () => {
    it("registers datafeed update", async () => {
      await datafeedContract.instance.update.postTransaction(opts, [
        [assetA, assetB],
        [inputPriceAssetA, inputPriceAssetB],
      ]);
      const newUid = await datafeedContract.instance.getLastUpdateId.call(
        opts,
        [],
      );

      expect(Number(newUid)).toEqual(0);
    });

    it("price updates are valid", async () => {
      const isValidA = await datafeedContract.instance.isValid.call(opts, [
        assetA,
      ]);
      const isValidB = await datafeedContract.instance.isValid.call(opts, [
        assetB,
      ]);

      expect(isValidA).toBe(true);
      expect(isValidB).toBe(true);
    });

    it("price updates are correct", async () => {
      let result = await datafeedContract.instance.getData.call(opts, [assetA]);
      const [timeAssetA, priceAssetA] = Object.values(result);
      result = await datafeedContract.instance.getData.call(opts, [assetB]);
      const [timeAssetB, priceAssetB] = Object.values(result);
      const getPriceResult = await datafeedContract.instance.getPrice.call(
        opts,
        [assetB],
      );

      expect(Number(priceAssetA)).toEqual(inputPriceAssetA);
      expect(Number(priceAssetB)).toEqual(inputPriceAssetB);
      expect(Number(priceAssetB)).toEqual(Number(getPriceResult));
      expect(Number(timeAssetA)).toEqual(Number(timeAssetB));
    });
  });

  describe("PriceFeed history", async () => {
    it("returns non-empty first chunk of data history for first asset", async () => {
      const dataHistory = await datafeedContract.instance.getDataHistory.call(
        opts,
        [assetA, 0],
      );
      const [timesA, pricesA] = Object.values(dataHistory);

      expect(Number(timesA[0])).not.toEqual(0);
      expect(Number(pricesA[0])).not.toEqual(0);
    });

    it("returns non-empty first chunk of data history for second asset", async () => {
      const dataHistory = await datafeedContract.instance.getDataHistory.call(
        opts,
        [assetB, 0],
      );
      const [timesB, pricesB] = Object.values(dataHistory);

      expect(Number(timesB[0])).not.toEqual(0);
      expect(Number(pricesB[0])).not.toEqual(0);
    });
  });
});
