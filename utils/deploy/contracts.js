// @flow
import Api from "@parity/api";

const fs = require("fs");
const pkgInfo = require("../../package.json");
const environmentConfig = require("../config/environment.js");
const tokenInfo = require("../info/tokenInfo.js");

// TODO: clean up repeated functions in deployment script
// TODO: make clearer the separation between deployments in different environments
async function deploy(environment) {
  try {
    let abi;
    let addressBook;
    let bytecode;
    let mlnAddr;
    let ethTokenAddress;
    let mlnToken;
    let eurToken;
    let ethToken;
    let datafeed;
    let datafeedContract;
    let fund;
    let governance;
    let participation;
    let riskMgmt;
    let simpleAdapter;
    let centralizedAdapter;
    let simpleMarket;
    let version;
    let ranking;
    const datafeedOnly = false;
    const addressBookFile = "./addressBook.json";
    const config = environmentConfig[environment];
    const provider = new Api.Provider.Http(
      `http://${config.host}:${config.port}`,
    );
    const api = new Api(provider);

    const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
    const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
    const yearInSeconds = 60 * 60 * 24 * 365;
    if (
      Number(config.networkId) !== Number(await api.net.version()) &&
      config.networkId !== "*"
    ) {
      throw new Error(`Deployment for environment ${environment} not defined`);
    }
    const accounts = await api.eth.accounts();
    const opts = {
      from: accounts[0],
      gas: config.gas,
      gasPrice: config.gasPrice,
    };

    if (environment === "kovan") {
      mlnAddr = `0x${tokenInfo[environment].find(t => t.symbol === "MLN-T").address}`;
      ethTokenAddress = `0x${tokenInfo[environment].find(t => t.symbol === "ETH-T").address}`;
      abi = JSON.parse(fs.readFileSync("out/assets/Asset.abi"));

      // deploy datafeed
      abi = JSON.parse(fs.readFileSync("out/pricefeeds/PriceFeed.abi", "utf8"));
      bytecode = fs.readFileSync("out/pricefeeds/PriceFeed.bin", "utf8");
      opts.data = `0x${bytecode}`;
      datafeed = await api
        .newContract(abi)
        .deploy(opts, [
          mlnAddr,
          'Melon Token',
          'MLN-T',
          18,
          'melonport.com',
          mockBytes,
          mockBytes,
          mockAddress,
          mockAddress,
          config.protocol.datafeed.interval,
          config.protocol.datafeed.validity,
        ]);
      console.log("Deployed datafeed");
      datafeedContract = await api.newContract(abi, datafeed);

      // deploy simplemarket
      abi = JSON.parse(fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi"));
      bytecode = fs.readFileSync("out/exchange/thirdparty/SimpleMarket.bin");
      opts.data = `0x${bytecode}`;
      // simpleMarket = await api.newContract(abi).deploy(opts, []);
      // console.log("Deployed simplemarket");
      simpleMarket = '0x7B1a19E7C84036503a177a456CF1C13e0239Fc02';
      console.log(`Using already-deployed SimpleMarket at ${simpleMarket}`);

      // deploy participation
      abi = JSON.parse(fs.readFileSync("out/compliance/NoCompliance.abi"));
      bytecode = fs.readFileSync("out/compliance/NoCompliance.bin");
      opts.data = `0x${bytecode}`;
      participation = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed participation");

      // deploy riskmgmt
      abi = JSON.parse(fs.readFileSync("out/riskmgmt/RMMakeOrders.abi"));
      bytecode = fs.readFileSync("out/riskmgmt/RMMakeOrders.bin");
      opts.data = `0x${bytecode}`;
      riskMgmt = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed riskmgmt");

      // deploy governance
      abi = JSON.parse(fs.readFileSync("out/system/Governance.abi"));
      bytecode = fs.readFileSync("out/system/Governance.bin");
      opts.data = `0x${bytecode}`;
      governance = await api.newContract(abi).deploy(opts, [[accounts[0]], 1, yearInSeconds]);
      console.log("Deployed governance");
      const governanceContract = await api.newContract(abi, governance);

      // deploy simpleAdapter
      abi = JSON.parse(
        fs.readFileSync("out/exchange/adapter/simpleAdapter.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/adapter/simpleAdapter.bin");
      opts.data = `0x${bytecode}`;
      simpleAdapter = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed simpleadapter");

      // deploy CentralizedAdapter
      abi = JSON.parse(
        fs.readFileSync("out/exchange/adapter/CentralizedAdapter.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/adapter/CentralizedAdapter.bin");
      opts.data = `0x${bytecode}`;
      centralizedAdapter = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed CentralizedAdapter");

      // deploy version (can use identical libs object as above)
      const versionAbi = JSON.parse(
        fs.readFileSync("out/version/Version.abi", "utf8"),
      );
      const versionBytecode = fs.readFileSync("out/version/Version.bin", "utf8");
      fs.writeFileSync("out/version/Version.bin", versionBytecode, "utf8");
      opts.data = `0x${versionBytecode}`;
      opts.gas = 6900000;
      version = await api
        .newContract(versionAbi)
        .deploy(opts, [pkgInfo.version, governance, ethTokenAddress], () => {}, true);
      console.log("Deployed version");

      // add Version to Governance tracking
      await governanceContract.instance.proposeVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.approveVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.triggerVersion.postTransaction({from: accounts[0]}, [version]);

      // deploy ranking contract
      abi = JSON.parse(fs.readFileSync("out/FundRanking.abi"));
      bytecode = fs.readFileSync("out/FundRanking.bin");
      opts.data = `0x${bytecode}`;
      ranking = await api.newContract(abi).deploy(opts, [version]);
      console.log("Deployed ranking contract");

      // register assets
      await Promise.all(
        config.protocol.registrar.assetsToRegister.map(async (assetSymbol) => {
          console.log(`Registering ${assetSymbol}`);
          const [tokenEntry] = tokenInfo[environment].filter(entry => entry.symbol === assetSymbol);
          console.log(datafeedContract.address)
          await datafeedContract.instance.register
            .postTransaction({from: accounts[0], gas: 6000000}, [
              `0x${tokenEntry.address}`,
              tokenEntry.name,
              tokenEntry.symbol,
              tokenEntry.decimals,
              tokenEntry.url,
              mockBytes,
              mockBytes,
              mockAddress,
              mockAddress,
            ]);
          console.log(`Registered ${assetSymbol}`);
        })
      );

      // update address book
      if (fs.existsSync(addressBookFile)) {
        addressBook = JSON.parse(fs.readFileSync(addressBookFile));
      } else addressBook = {};

      addressBook[environment] = {
        PriceFeed: datafeed,
        SimpleMarket: simpleMarket,
        NoCompliance: participation,
        RMMakeOrders: riskMgmt,
        Governance: governance,
        simpleAdapter,
        Version: version,
        Ranking: ranking,
      };
    } else if (environment === "live") {
      mlnAddr = `0x${tokenInfo[environment].find(t => t.symbol === "MLN").address}`;
      ethTokenAddress = `0x${tokenInfo[environment].find(t => t.symbol === "OW-ETH").address}`;
      abi = JSON.parse(fs.readFileSync("out/assets/Asset.abi"));

      if (datafeedOnly) {
        // deploy datafeed
        abi = JSON.parse(fs.readFileSync("out/pricefeeds/PriceFeed.abi"));
        bytecode = fs.readFileSync("out/pricefeeds/PriceFeed.bin");
        opts.data = `0x${bytecode}`;
        datafeed = await api
          .newContract(abi)
          .deploy(opts, [
            mlnAddr,
            'Melon Token',
            'MLN',
            18,
            'melonport.com',
            mockBytes,
            mockBytes,
            mockAddress,
            mockAddress,
            config.protocol.datafeed.interval,
            config.protocol.datafeed.validity,
          ]);
        console.log("Deployed datafeed");

        await Promise.all(
          config.protocol.registrar.assetsToRegister.map(async (assetSymbol) => {
            console.log(`Registering ${assetSymbol}`);
            const [tokenEntry] = tokenInfo[environment].filter(entry => entry.symbol === assetSymbol);
            await datafeed.instance.register
              .postTransaction({from: accounts[0], gas: 6000000}, [
                `0x${tokenEntry.address}`,
                tokenEntry.name,
                tokenEntry.symbol,
                tokenEntry.decimals,
                tokenEntry.url,
                mockBytes,
                mockBytes,
                mockAddress,
                mockAddress,
              ])
              .then(() => console.log(`Registered ${assetSymbol}`));
          })
        );
        // update address book
        if (fs.existsSync(addressBookFile)) {
          addressBook = JSON.parse(fs.readFileSync(addressBookFile));
        } else addressBook = {};

        addressBook[environment] = {
          PriceFeed: datafeed,
        };
      } else if (!datafeedOnly) {
        // deploy participation
        abi = JSON.parse(
          fs.readFileSync("out/compliance/NoCompliance.abi"),
        );
        bytecode = fs.readFileSync("out/compliance/NoCompliance.bin");
        opts.data = `0x${bytecode}`;
        participation = await api.newContract(abi).deploy(opts, []);
        console.log(`Deployed participation at ${participation}`);

        // deploy riskmgmt
        abi = JSON.parse(fs.readFileSync("out/riskmgmt/RMMakeOrders.abi"));
        bytecode = fs.readFileSync("out/riskmgmt/RMMakeOrders.bin");
        opts.data = `0x${bytecode}`;
        riskMgmt = await api.newContract(abi).deploy(opts, []);
        console.log(`Deployed riskmgmt at ${riskMgmt}`);

        // deploy simpleAdapter
        abi = JSON.parse(
          fs.readFileSync("out/exchange/adapter/simpleAdapter.abi"),
        );
        bytecode = fs.readFileSync("out/exchange/adapter/simpleAdapter.bin");
        opts.data = `0x${bytecode}`;
        simpleAdapter = await api.newContract(abi).deploy(opts, []);
        console.log(`Deployed simpleadapter at ${simpleAdapter}`);

        // deploy governance
        // TODO: move this to config
        const authorityAddress = '0x00b5d2D3DB5CBAb9c2eb3ED3642A0c289008425B';
        abi = JSON.parse(fs.readFileSync("out/system/Governance.abi"));
        bytecode = fs.readFileSync("out/system/Governance.bin");
        opts.data = `0x${bytecode}`;
        governance = await api.newContract(abi).deploy(opts, [
          [authorityAddress],
          1,
          yearInSeconds
        ]);
        console.log(`Deployed governance at ${governance}`);
        const governanceContract = await api.newContract(abi, governance);

        abi = JSON.parse(fs.readFileSync("out/Fund.abi"));
        bytecode = fs.readFileSync("out/Fund.bin", "utf8");
        opts.data = `0x${bytecode}`;
        opts.gas = 6700000;

        // deploy version (can use identical libs object as above)
        const versionAbi = JSON.parse(fs.readFileSync("out/version/Version.abi", "utf8"));
        const versionBytecode = fs.readFileSync("out/version/Version.bin", "utf8");
        opts.data = `0x${versionBytecode}`;
        opts.gas = 6700000;
        version = await api
          .newContract(versionAbi)
          .deploy(opts, [pkgInfo.version, governance, ethTokenAddress], () => {}, true);
        console.log(`Deployed Version at ${version}`);

        // add Version to Governance tracking
        await governanceContract.instance.proposeVersion.postTransaction({from: authorityAddress}, [version]);
        await governanceContract.instance.approveVersion.postTransaction({from: authorityAddress}, [version]);
        await governanceContract.instance.triggerVersion.postTransaction({from: authorityAddress}, [version]);

        // update address book
        if (fs.existsSync(addressBookFile)) {
          addressBook = JSON.parse(fs.readFileSync(addressBookFile));
        } else addressBook = {};

        addressBook[environment] = {
          NoCompliance: participation,
          RMMakeOrders: riskMgmt,
          simpleAdapter,
        };
      }
    } else if (environment === "development") {
      abi = JSON.parse(fs.readFileSync("./out/assets/PreminedAsset.abi"));
      bytecode = fs.readFileSync("./out/assets/PreminedAsset.bin");
      opts.data = `0x${bytecode}`;
      ethToken = await api
        .newContract(abi)
        .deploy(opts, []);
      console.log("Deployed ether token");

      mlnToken = await api
        .newContract(abi)
        .deploy(opts, []);
      console.log("Deployed melon token");

      eurToken = await api
        .newContract(abi)
        .deploy(opts, []);
      console.log("Deployed euro token");

      abi = JSON.parse(fs.readFileSync("out/assets/Asset.abi"));

      // deploy pricefeed
      abi = JSON.parse(fs.readFileSync("out/pricefeeds/PriceFeed.abi"));
      bytecode = fs.readFileSync("out/pricefeeds/PriceFeed.bin");
      opts.data = `0x${bytecode}`;
      datafeed = await api
        .newContract(abi)
        .deploy(opts, [
          mlnToken,
          'Melon Token',
          'MLN-T',
          18,
          'melonport.com',
          mockBytes,
          mockBytes,
          mockAddress,
          mockAddress,
          config.protocol.datafeed.interval,
          config.protocol.datafeed.validity,
        ]);
      datafeedContract = await api.newContract(abi, datafeed);
      // deploy simplemarket
      abi = JSON.parse(
        fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/thirdparty/SimpleMarket.bin");
      opts.data = `0x${bytecode}`;
      simpleMarket = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed simplemarket");

      // deploy participation
      abi = JSON.parse(fs.readFileSync("out/compliance/NoCompliance.abi"));
      bytecode = fs.readFileSync("out/compliance/NoCompliance.bin");
      opts.data = `0x${bytecode}`;
      participation = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed participation");

      // deploy riskmgmt
      abi = JSON.parse(fs.readFileSync("out/riskmgmt/RMMakeOrders.abi"));
      bytecode = fs.readFileSync("out/riskmgmt/RMMakeOrders.bin");
      opts.data = `0x${bytecode}`;
      riskMgmt = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed riskmgmt");

      // deploy governance
      abi = JSON.parse(fs.readFileSync("out/system/Governance.abi"));
      bytecode = fs.readFileSync("out/system/Governance.bin");
      opts.data = `0x${bytecode}`;
      governance = await api.newContract(abi).deploy(opts, [[accounts[0]], 1, 100000]);
      console.log("Deployed governance");
      const governanceContract = await api.newContract(abi, governance);

      // deploy simpleAdapter
      abi = JSON.parse(
        fs.readFileSync("out/exchange/adapter/simpleAdapter.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/adapter/simpleAdapter.bin");
      opts.data = `0x${bytecode}`;
      simpleAdapter = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed simpleadapter");

      // deploy CentralizedAdapter
      abi = JSON.parse(
        fs.readFileSync("out/exchange/adapter/CentralizedAdapter.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/adapter/CentralizedAdapter.bin");
      opts.data = `0x${bytecode}`;
      centralizedAdapter = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed CentralizedAdapter");

      const versionAbi = JSON.parse(
        fs.readFileSync("out/version/Version.abi", "utf8"),
      );
      const versionBytecode = fs.readFileSync("out/version/Version.bin", "utf8");
      fs.writeFileSync("out/version/Version.bin", versionBytecode, "utf8");
      opts.data = `0x${versionBytecode}`;
      opts.gas = 6900000;
      version = await api
        .newContract(versionAbi)
        .deploy(opts, [pkgInfo.version, governance, ethToken], () => {}, true);
      console.log("Deployed version");

      // add Version to Governance tracking
      await governanceContract.instance.proposeVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.approveVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.triggerVersion.postTransaction({from: accounts[0]}, [version]);
      console.log('Version added to Governance');

      // deploy fund to test with
      abi = JSON.parse(fs.readFileSync("out/Fund.abi"));
      bytecode = fs.readFileSync("out/Fund.bin", "utf8");
      opts.data = `0x${bytecode}`;
      opts.gas = 6900000;
      fund = await api.newContract(abi).deploy(
        opts,
        [
          accounts[0],
          "Melon Portfolio", // name
          mlnToken, // base asset
          0, // management reward
          0, // performance reward
          ethToken, // Native Asset
          participation, // participation
          riskMgmt, // riskMgmt
          datafeed, // pricefeed
          [simpleMarket], // simple market
          [simpleAdapter]
        ],
        () => {},
        true,
      );
      console.log("Deployed fund");

      // register assets
      await datafeedContract.instance.register.postTransaction({}, [
        ethToken,
        "Ether token",
        "ETH-T",
        18,
        "ethereum.org",
        mockBytes,
        mockBytes,
        mockAddress,
        mockAddress,
      ]);
      await datafeedContract.instance.register.postTransaction({}, [
        eurToken,
        "Euro token",
        "EUR-T",
        18,
        "europa.eu",
        mockBytes,
        mockBytes,
        mockAddress,
        mockAddress,
      ]);
      await datafeedContract.instance.register.postTransaction({}, [
        mlnToken,
        "Melon token",
        "MLN-T",
        18,
        "melonport.com",
        mockBytes,
        mockBytes,
        mockAddress,
        mockAddress,
      ]);
      console.log("Done registration");

      // update address book
      if (fs.existsSync(addressBookFile)) {
        addressBook = JSON.parse(fs.readFileSync(addressBookFile));
      } else addressBook = {};

      addressBook[environment] = {
        PriceFeed: datafeed,
        SimpleMarket: simpleMarket,
        NoCompliance: participation,
        RMMakeOrders: riskMgmt,
        Governance: governance,
        simpleAdapter,
        centralizedAdapter,
        Version: version,
        MlnToken: mlnToken,
        EurToken: eurToken,
        EthToken: ethToken,
        Fund: fund,
      };
    }

    // write out addressBook
    console.log(`Writing addresses to ${addressBookFile}`);
    console.dir(addressBook)
    fs.writeFileSync(
      addressBookFile,
      JSON.stringify(addressBook, null, "\t"),
      "utf8",
    );

    if (require.main === module) {
      process.exit();
    }
  } catch (err) {
    console.log(err.stack);
  }
}

if (require.main === module) {
  if (process.argv.length < 2) {
    throw new Error(`Please specify a deployment environment`);
  } else {
    deploy(process.argv[2]);
  }
}

export default deploy;
