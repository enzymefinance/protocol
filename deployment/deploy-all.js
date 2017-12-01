import Api from "@parity/api";

const fs = require("fs");
const path = require("path");
const solc = require("solc");
const environmentConfig = require("./environment.config.js");
const pkgInfo = require("../package.json");
const tokenInfo = require("./token.info.js");
const exchangeInfo = require("./exchange_info.js");
const datafeedInfo = require("./data_feed_info.js");

function getPlaceholderFromPath(libPath) {
  const libContractName = path.basename(libPath);
  let modifiedPath = libPath.replace("out", "src");
  modifiedPath = `${modifiedPath}.sol:${libContractName}`;
  return modifiedPath.slice(0, 36);
}

// TODO: clean up repeated functions in deployment script
// TODO: make clearer the separation between deployments in different environments
async function deploy(environment) {
  try {
    let abi;
    let addressBook;
    let bytecode;
    let mlnAddr;
    let mlnToken;
    let eurToken;
    let ethToken;
    let libObject = {};
    let datafeed;
    let datafeedContract;
    let fund;
    let governance;
    let participation;
    let rewards;
    let riskMgmt;
    let simpleAdapter;
    let simpleMarket;
    let sphere;
    let version;
    let ranking;
    let rankingContract;
    const datafeedOnly = false;
    const addressBookFile = "./address-book.json";
    const config = environmentConfig[environment];
    const provider = new Api.Provider.Http(
      `http://${config.host}:${config.port}`,
    );
    const api = new Api(provider);

    const mockBytes =
      "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
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
      mlnAddr = tokenInfo[environment].find(t => t.symbol === "MLN-T").address;
      abi = JSON.parse(fs.readFileSync("out/assets/Asset.abi"));
      const mlnTokenContract = await api.newContract(abi, mlnAddr);
      const mlnName = await mlnTokenContract.instance.getName.call({}, []);
      const mlnSymbol = await mlnTokenContract.instance.getSymbol.call({}, []);
      const mlnDecimals = await mlnTokenContract.instance.getDecimals.call({}, []);

      // deploy datafeed
      abi = JSON.parse(fs.readFileSync("out/datafeeds/DataFeed.abi"));
      bytecode = fs.readFileSync("out/datafeeds/DataFeed.bin");
      opts.data = `0x${bytecode}`;
      datafeed = await api
        .newContract(abi)
        .deploy(opts, [
          mlnAddr,
          mlnName,
          mlnSymbol,
          mlnDecimals,
          'melonport.com',
          mockBytes,
          mockBytes,
          mockAddress,
          mockAddress,
          config.protocol.datafeed.interval,
          config.protocol.datafeed.validity,
        ]);
      datafeedContract = await api.newContract(abi, datafeed);
      console.log("Deployed datafeed");

      // deploy simplemarket
      abi = JSON.parse(
        fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/thirdparty/SimpleMarket.bin");
      opts.data = `0x${bytecode}`;
      simpleMarket = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed simplemarket");

      // deploy sphere
      abi = JSON.parse(fs.readFileSync("out/sphere/Sphere.abi"));
      bytecode = fs.readFileSync("out/sphere/Sphere.bin");
      opts.data = `0x${bytecode}`;
      sphere = await api
        .newContract(abi)
        .deploy(opts, [datafeed, simpleMarket]);
      console.log("Deployed sphere");

      // deploy participation
      abi = JSON.parse(fs.readFileSync("out/participation/ParticipationOpen.abi"));
      bytecode = fs.readFileSync("out/participation/ParticipationOpen.bin");
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

      // deploy rewards
      abi = JSON.parse(fs.readFileSync("out/libraries/rewards.abi"));
      bytecode = fs.readFileSync("out/libraries/rewards.bin");
      opts.data = `0x${bytecode}`;
      rewards = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed rewards");

      // deploy simpleAdapter
      abi = JSON.parse(
        fs.readFileSync("out/exchange/adapter/simpleAdapter.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/adapter/simpleAdapter.bin");
      opts.data = `0x${bytecode}`;
      simpleAdapter = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed simpleadapter");

      libObject[getPlaceholderFromPath("out/libraries/rewards")] = rewards;
      libObject[
        getPlaceholderFromPath("out/exchange/adapter/simpleAdapter")
      ] = simpleAdapter;
      // deploy version (can use identical libs object as above)
      const versionAbi = JSON.parse(
        fs.readFileSync("out/version/Version.abi", "utf8"),
      );
      let versionBytecode = fs.readFileSync("out/version/Version.bin", "utf8");
      versionBytecode = solc.linkBytecode(versionBytecode, libObject);
      fs.writeFileSync("out/version/Version.bin", versionBytecode, "utf8");
      opts.data = `0x${versionBytecode}`;
      opts.gas = 6900000;
      version = await api
        .newContract(versionAbi)
        .deploy(opts, ['0.5.2', governance, mlnAddr], () => {}, true);
      console.log("Deployed version");

      // add Version to Governance tracking
      await governanceContract.instance.proposeVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.approveVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.triggerVersion.postTransaction({from: accounts[0]}, [version]);

      // deploy ranking contract
      abi = JSON.parse(fs.readFileSync("out/Ranking.abi"));
      bytecode = fs.readFileSync("out/Ranking.bin");
      opts.data = `0x${bytecode}`;
      ranking = await api.newContract(abi).deploy(opts, [version]);
      console.log("Deployed ranking contract");

      // register assets
      for (const assetSymbol of config.protocol.registrar.assetsToRegister) {
        console.log(`Registering ${assetSymbol}`);
        const token = tokenInfo[environment].filter(
          token => token.symbol === assetSymbol,
        )[0];
        await datafeedContract.instance.register
          .postTransaction(opts, [
            token.address,
            token.name,
            token.symbol,
            token.decimals,
            token.url,
            mockBytes,
            mockBytes,
            mockAddress,
            mockAddress,
          ])
          .then(() => console.log(`Registered ${assetSymbol}`));
      }

      // update address book
      if (fs.existsSync(addressBookFile)) {
        addressBook = JSON.parse(fs.readFileSync(addressBookFile));
      } else addressBook = {};

      addressBook[environment] = {
        DataFeed: datafeed,
        SimpleMarket: simpleMarket,
        Sphere: sphere,
        ParticipationOpen: participation,
        RMMakeOrders: riskMgmt,
        Governance: governance,
        rewards,
        simpleAdapter,
        Version: version,
        Ranking: ranking,
      };
    } else if (environment === "live") {
      mlnAddr = tokenInfo[environment].find(t => t.symbol === "MLN").address;
      abi = JSON.parse(fs.readFileSync("out/assets/Asset.abi"));
      const mlnTokenContract = await api.newContract(abi, mlnAddr);
      const mlnName = await mlnTokenContract.instance.getName.call({}, []);
      const mlnSymbol = await mlnTokenContract.instance.getSymbol.call({}, []);
      const mlnDecimals = await mlnTokenContract.instance.getDecimals.call({}, []);

      if (datafeedOnly) {
        // deploy datafeed
        abi = JSON.parse(fs.readFileSync("out/datafeeds/DataFeed.abi"));
        bytecode = fs.readFileSync("out/datafeeds/DataFeed.bin");
        opts.data = `0x${bytecode}`;
        datafeed = await api
          .newContract(abi)
          .deploy(opts, [
            mlnAddr,
            mlnName,
            mlnSymbol,
            mlnDecimals,
            'melonport.com',
            mockBytes,
            mockBytes,
            mockAddress,
            mockAddress,
            config.protocol.datafeed.interval,
            config.protocol.datafeed.validity,
          ]);
        console.log("Deployed datafeed");

        for (const assetSymbol of config.protocol.registrar.assetsToRegister) {
          console.log(`Registering ${assetSymbol}`);
          const token = tokenInfo[environment].filter(
            token => token.symbol === assetSymbol,
          )[0];
          await datafeed.instance.register
            .postTransaction(opts, [
              token.address,
              token.name,
              token.symbol,
              token.decimals,
              token.url,
              mockBytes,
              mockBytes,
              mockAddress,
              mockAddress,
            ])
            .then(() => console.log(`Registered ${assetSymbol}`));
        }
        // update address book
        if (fs.existsSync(addressBookFile)) {
          addressBook = JSON.parse(fs.readFileSync(addressBookFile));
        } else addressBook = {};

        addressBook[environment] = {
          DataFeed: datafeed,
        };
      } else if (!datafeedOnly) {
        const thomsonReutersAddress = datafeedInfo[environment].find(
          feed => feed.name === "Thomson Reuters",
        ).address;
        const oasisDexAddress = exchangeInfo[environment].find(
          exchange => exchange.name === "OasisDex",
        ).address;

        abi = JSON.parse(fs.readFileSync("out/sphere/Sphere.abi"));
        bytecode = fs.readFileSync("out/sphere/Sphere.bin");
        opts.data = `0x${bytecode}`;
        sphere = await api
          .newContract(abi)
          .deploy(opts, [thomsonReutersAddress, oasisDexAddress]);
        console.log(`Deployed sphere at ${sphere}`);

        // deploy participation
        abi = JSON.parse(
          fs.readFileSync("out/participation/ParticipationOpen.abi"),
        );
        bytecode = fs.readFileSync("out/participation/ParticipationOpen.bin");
        opts.data = `0x${bytecode}`;
        participation = await api.newContract(abi).deploy(opts, []);
        console.log(`Deployed participation at ${participation}`);

        // deploy riskmgmt
        abi = JSON.parse(fs.readFileSync("out/riskmgmt/RMMakeOrders.abi"));
        bytecode = fs.readFileSync("out/riskmgmt/RMMakeOrders.bin");
        opts.data = `0x${bytecode}`;
        riskMgmt = await api.newContract(abi).deploy(opts, []);
        console.log(`Deployed riskmgmt at ${riskMgmt}`);

        // deploy rewards
        abi = JSON.parse(fs.readFileSync("out/libraries/rewards.abi"));
        bytecode = fs.readFileSync("out/libraries/rewards.bin");
        opts.data = `0x${bytecode}`;
        rewards = await api.newContract(abi).deploy(opts, []);
        console.log(`Deployed rewards at ${rewards}`);

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

        // link libs to fund (needed to deploy version)
        abi = JSON.parse(fs.readFileSync("out/Fund.abi"));
        bytecode = fs.readFileSync("out/Fund.bin", "utf8");
        libObject = {};
        libObject[getPlaceholderFromPath("out/libraries/rewards")] = rewards;
        libObject[
          getPlaceholderFromPath("out/exchange/adapter/simpleAdapter")
        ] = simpleAdapter;
        bytecode = solc.linkBytecode(bytecode, libObject);
        opts.data = `0x${bytecode}`;
        opts.gas = 6700000;

        // deploy version (can use identical libs object as above)
        const versionAbi = JSON.parse(
          fs.readFileSync("out/version/Version.abi", "utf8"),
        );
        let versionBytecode = fs.readFileSync("out/version/Version.bin", "utf8");
        versionBytecode = solc.linkBytecode(versionBytecode, libObject);
        fs.writeFileSync("out/version/Version.bin", versionBytecode, "utf8");
        opts.data = `0x${versionBytecode}`;
        opts.gas = 6700000;
        version = await api
          .newContract(versionAbi)
          .deploy(opts, ['0.5.2', governance, mlnAddr], () => {}, true);
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
          Sphere: sphere,
          ParticipationOpen: participation,
          RMMakeOrders: riskMgmt,
          rewards,
          simpleAdapter,
        };
      }
    } else if (environment === "development") {
      const preminedAmount = 10 ** 20;

      abi = JSON.parse(fs.readFileSync("./out/assets/PreminedAsset.abi"));
      bytecode = fs.readFileSync("./out/assets/PreminedAsset.bin");
      opts.data = `0x${bytecode}`;
      ethToken = await api
        .newContract(abi)
        .deploy(opts, ["Ether token", "ETH-T", 18, preminedAmount]);
      console.log("Deployed ether token");

      mlnToken = await api
        .newContract(abi)
        .deploy(opts, ["Melon token", "MLN-T", 18, preminedAmount]);
      console.log("Deployed melon token");

      eurToken = await api
        .newContract(abi)
        .deploy(opts, ["Euro token", "EUR-T", 18, preminedAmount]);
      console.log("Deployed euro token");

      abi = JSON.parse(fs.readFileSync("out/assets/Asset.abi"));
      const mlnTokenContract = await api.newContract(abi, mlnToken);
      const mlnName = await mlnTokenContract.instance.getName.call({}, []);
      const mlnSymbol = await mlnTokenContract.instance.getSymbol.call({}, []);
      const mlnDecimals = await mlnTokenContract.instance.getDecimals.call({}, []);

      // deploy datafeed
      abi = JSON.parse(fs.readFileSync("out/datafeeds/DataFeed.abi"));
      bytecode = fs.readFileSync("out/datafeeds/DataFeed.bin");
      opts.data = `0x${bytecode}`;
      datafeed = await api
        .newContract(abi)
        .deploy(opts, [
          mlnToken,
          mlnName,
          mlnSymbol,
          mlnDecimals,
          'melonport.com',
          mockBytes,
          mockBytes,
          mockAddress,
          mockAddress,
          config.protocol.datafeed.interval,
          config.protocol.datafeed.validity,
        ]);
      datafeedContract = await api.newContract(abi, datafeed);
      console.log("Deployed datafeed");

      // deploy simplemarket
      abi = JSON.parse(
        fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/thirdparty/SimpleMarket.bin");
      opts.data = `0x${bytecode}`;
      simpleMarket = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed simplemarket");

      // deploy sphere
      abi = JSON.parse(fs.readFileSync("out/sphere/Sphere.abi"));
      bytecode = fs.readFileSync("out/sphere/Sphere.bin");
      opts.data = `0x${bytecode}`;
      sphere = await api
        .newContract(abi)
        .deploy(opts, [datafeed, simpleMarket]);
      console.log("Deployed sphere");

      // deploy participation
      abi = JSON.parse(fs.readFileSync("out/participation/ParticipationOpen.abi"));
      bytecode = fs.readFileSync("out/participation/ParticipationOpen.bin");
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

      // deploy rewards
      abi = JSON.parse(fs.readFileSync("out/libraries/rewards.abi"));
      bytecode = fs.readFileSync("out/libraries/rewards.bin");
      opts.data = `0x${bytecode}`;
      rewards = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed rewards");

      // deploy simpleAdapter
      abi = JSON.parse(
        fs.readFileSync("out/exchange/adapter/simpleAdapter.abi"),
      );
      bytecode = fs.readFileSync("out/exchange/adapter/simpleAdapter.bin");
      opts.data = `0x${bytecode}`;
      simpleAdapter = await api.newContract(abi).deploy(opts, []);
      console.log("Deployed simpleadapter");

      // link libs to fund (needed to deploy version)
      let fundBytecode = fs.readFileSync("out/Fund.bin", "utf8");
      libObject[getPlaceholderFromPath("out/libraries/rewards")] = rewards;
      libObject[
        getPlaceholderFromPath("out/exchange/adapter/simpleAdapter")
      ] = simpleAdapter;
      fundBytecode = solc.linkBytecode(fundBytecode, libObject);
      fs.writeFileSync("out/Fund.bin", fundBytecode, "utf8");

      // deploy version (can use identical libs object as above)
      const versionAbi = JSON.parse(
        fs.readFileSync("out/version/Version.abi", "utf8"),
      );
      let versionBytecode = fs.readFileSync("out/version/Version.bin", "utf8");
      versionBytecode = solc.linkBytecode(versionBytecode, libObject);
      fs.writeFileSync("out/version/Version.bin", versionBytecode, "utf8");
      opts.data = `0x${versionBytecode}`;
      opts.gas = 5990000;
      version = await api
        .newContract(versionAbi)
        .deploy(opts, [pkgInfo.version, governance, mlnToken], () => {}, true);
      console.log("Deployed version");

      // add Version to Governance tracking
      await governanceContract.instance.proposeVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.approveVersion.postTransaction({from: accounts[0]}, [version]);
      await governanceContract.instance.triggerVersion.postTransaction({from: accounts[0]}, [version]);
      console.log('Version added to Governance');

      // deploy fund to test with
      abi = JSON.parse(fs.readFileSync("out/Fund.abi"));
      bytecode = fs.readFileSync("out/Fund.bin", "utf8");
      libObject = {};
      libObject[getPlaceholderFromPath("out/libraries/rewards")] = rewards;
      libObject[
        getPlaceholderFromPath("out/exchange/adapter/simpleAdapter")
      ] = simpleAdapter;
      bytecode = solc.linkBytecode(bytecode, libObject);
      opts.data = `0x${bytecode}`;
      opts.gas = 5990000;
      fund = await api.newContract(abi).deploy(
        opts,
        [
          accounts[0],
          "Melon Portfolio", // name
          mlnToken, // reference asset
          0, // management reward
          0, // performance reward
          mlnToken, // melon asset
          participation, // participation
          riskMgmt, // riskMgmt
          sphere, // sphere
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
        DataFeed: datafeed,
        SimpleMarket: simpleMarket,
        Sphere: sphere,
        ParticipationOpen: participation,
        RMMakeOrders: riskMgmt,
        Governance: governance,
        rewards,
        simpleAdapter,
        Version: version,
        MlnToken: mlnToken,
        EurToken: eurToken,
        EthToken: ethToken,
        Fund: fund,
      };
    }

    // write out addressBook
    console.log(`Writing addresses to ${addressBookFile}`);
    fs.writeFileSync(
      addressBookFile,
      JSON.stringify(addressBook, null, "\t"),
      "utf8",
    );
    process.exit();
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
