const fs = require('fs');
const path = require('path');
const solc = require('solc');
const Web3 = require('web3');
const environmentConfig = require('./environment.config.js');
const pkgInfo = require('../package.json');
const tokenInfo = require('./token.info.js');
const exchangeInfo = require('./exchange_info.js');
const datafeedInfo = require('./data_feed_info.js');

function getPlaceholderFromPath(libPath) {
  const libContractName = path.basename(libPath);
  let modifiedPath = libPath.replace('out', 'src');
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
    let fund;
    let governance;
    let participation;
    let rewards;
    let riskMgmt;
    let simpleAdapter;
    let simpleMarket;
    let sphere;
    let version;
    const datafeedOnly = false;
    const addressBookFile = './address-book.json';
    const config = environmentConfig[environment];
    const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));
    const mockBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    const mockAddress = '0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183';
    if((Number(config.networkId) !== await web3.eth.net.getId()) && (config.networkId !== '*')) {
      throw new Error(`Deployment for environment ${environment} not defined`);
    }
    const accounts = await web3.eth.getAccounts();
    const opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice, };

    if(environment === 'kovan') {
      mlnAddr = tokenInfo[environment].find(t => t.symbol === 'MLN-T').address;

      // deploy datafeed
      abi = JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi'));
      bytecode = fs.readFileSync('out/datafeeds/DataFeed.bin');
      datafeed = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [mlnAddr, config.protocol.datafeed.interval, config.protocol.datafeed.validity],
      }).send(opts));
      console.log('Deployed datafeed');

      // deploy simplemarket
      abi = JSON.parse(fs.readFileSync('out/exchange/thirdparty/SimpleMarket.abi'));
      bytecode = fs.readFileSync('out/exchange/thirdparty/SimpleMarket.bin');
      simpleMarket = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed simplemarket');

      // deploy sphere
      abi = JSON.parse(fs.readFileSync('out/sphere/Sphere.abi'));
      bytecode = fs.readFileSync('out/sphere/Sphere.bin');
      sphere = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [
          datafeed.options.address,
          simpleMarket.options.address,
        ],
      }).send(opts));
      console.log('Deployed sphere');

      // deploy participation
      abi = JSON.parse(fs.readFileSync('out/participation/ParticipationOpen.abi'));
      bytecode = fs.readFileSync('out/participation/ParticipationOpen.bin');
      participation = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed participation');

      // deploy riskmgmt
      abi = JSON.parse(fs.readFileSync('out/riskmgmt/RMMakeOrders.abi'));
      bytecode = fs.readFileSync('out/riskmgmt/RMMakeOrders.bin');
      riskMgmt = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed riskmgmt');

      // deploy governance
      abi = JSON.parse(fs.readFileSync('out/system/Governance.abi'));
      bytecode = fs.readFileSync('out/system/Governance.bin');
      governance = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [mlnAddr],
      }).send(opts));
      console.log('Deployed governance');

      // deploy rewards
      abi = JSON.parse(fs.readFileSync('out/libraries/rewards.abi'));
      bytecode = fs.readFileSync('out/libraries/rewards.bin');
      rewards = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed rewards');

      // deploy simpleAdapter
      abi = JSON.parse(fs.readFileSync('out/exchange/adapter/simpleAdapter.abi'));
      bytecode = fs.readFileSync('out/exchange/adapter/simpleAdapter.bin');
      simpleAdapter = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed simpleadapter');

      libObject[getPlaceholderFromPath('out/libraries/rewards')] = rewards.options.address;
      libObject[getPlaceholderFromPath('out/exchange/adapter/simpleAdapter')] = simpleAdapter.options.address;
      // deploy version (can use identical libs object as above)
      const versionAbi = JSON.parse(fs.readFileSync('out/version/Version.abi', 'utf8'));
      let versionBytecode = fs.readFileSync('out/version/Version.bin', 'utf8');
      versionBytecode = solc.linkBytecode(versionBytecode, libObject);
      fs.writeFileSync('out/version/Version.bin', versionBytecode, 'utf8');
      version = await (new web3.eth.Contract(versionAbi).deploy({
        data: `0x${versionBytecode}`,
        arguments: [
          pkgInfo.version,
          governance.options.address,
          mlnAddr
        ],
      }).send(opts));
      console.log('Deployed version');

      // register assets
      for(const assetSymbol of config.protocol.registrar.assetsToRegister) {
        console.log(`Registering ${assetSymbol}`);
        const token = tokenInfo[environment].filter(token => token.symbol === assetSymbol)[0];
        await datafeed.methods.register(
          token.address,
          token.name,
          token.symbol,
          token.decimals,
          token.url,
          mockBytes,
          mockBytes,
          mockAddress,
          mockAddress,
        ).send(opts).then(() => console.log(`Registered ${assetSymbol}`));
      }

      // update address book
      if(fs.existsSync(addressBookFile)) {
        addressBook = JSON.parse(fs.readFileSync(addressBookFile));
      } else addressBook = {};

      addressBook[environment] = {
        DataFeed: datafeed.options.address,
        SimpleMarket: simpleMarket.options.address,
        Sphere: sphere.options.address,
        Participation: participation.options.address,
        RMMakeOrders: riskMgmt.options.address,
        Governance: governance.options.address,
        rewards: rewards.options.address,
        simpleAdapter: simpleAdapter.options.address,
        Version: version.options.address,
      };
    } else if(environment === 'live') {
      mlnAddr = tokenInfo[environment].find(t => t.symbol === 'MLN').address;

      if(datafeedOnly) {
        // deploy datafeed
        abi = JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi'));
        bytecode = fs.readFileSync('out/datafeeds/DataFeed.bin');
        datafeed = await (new web3.eth.Contract(abi).deploy({
          data: `0x${bytecode}`,
          arguments: [mlnAddr, config.protocol.datafeed.interval, config.protocol.datafeed.validity],
        }).send(opts));
        console.log('Deployed datafeed');

        for(const assetSymbol of config.protocol.registrar.assetsToRegister) {
          console.log(`Registering ${assetSymbol}`);
          const token = tokenInfo[environment].filter(token => token.symbol === assetSymbol)[0];
          await datafeed.methods.register(
            token.address,
            token.name,
            token.symbol,
            token.decimals,
            token.url,
            mockBytes,
            mockBytes,
            mockAddress,
            mockAddress,
          ).send(opts).then(() => console.log(`Registered ${assetSymbol}`));
        }
        // update address book
        if(fs.existsSync(addressBookFile)) {
          addressBook = JSON.parse(fs.readFileSync(addressBookFile));
        } else addressBook = {};

        addressBook[environment] = {
          DataFeed: datafeed.options.address,
        };
      } else if(!datafeedOnly) {
        const thomsonReutersAddress = datafeedInfo[environment].find(feed => feed.name === 'Thomson Reuters').address;
        const oasisDexAddress = exchangeInfo[environment].find(exchange => exchange.name === 'OasisDex').address;

        abi = JSON.parse(fs.readFileSync('out/sphere/Sphere.abi'));
        bytecode = fs.readFileSync('out/sphere/Sphere.bin');
        sphere = await (new web3.eth.Contract(abi).deploy({
          data: `0x${bytecode}`,
          arguments: [
            thomsonReutersAddress,
            oasisDexAddress,
          ],
        }).send(opts));
        console.log('Deployed sphere');

        // deploy participation
        abi = JSON.parse(fs.readFileSync('out/participation/Participation.abi'));
        bytecode = fs.readFileSync('out/participation/Participation.bin');
        participation = await (new web3.eth.Contract(abi).deploy({
          data: `0x${bytecode}`,
          arguments: [],
        }).send(opts));
        console.log('Deployed participation');

        // deploy riskmgmt
        abi = JSON.parse(fs.readFileSync('out/riskmgmt/RMMakeOrders.abi'));
        bytecode = fs.readFileSync('out/riskmgmt/RMMakeOrders.bin');
        riskMgmt = await (new web3.eth.Contract(abi).deploy({
          data: `0x${bytecode}`,
          arguments: [],
        }).send(opts));
        console.log('Deployed riskmgmt');

        // deploy rewards
        abi = JSON.parse(fs.readFileSync('out/libraries/rewards.abi'));
        bytecode = fs.readFileSync('out/libraries/rewards.bin');
        rewards = await (new web3.eth.Contract(abi).deploy({
          data: `0x${bytecode}`,
          arguments: [],
        }).send(opts));
        console.log('Deployed rewards');

        // deploy simpleAdapter
        abi = JSON.parse(fs.readFileSync('out/exchange/adapter/simpleAdapter.abi'));
        bytecode = fs.readFileSync('out/exchange/adapter/simpleAdapter.bin');
        simpleAdapter = await (new web3.eth.Contract(abi).deploy({
          data: `0x${bytecode}`,
          arguments: [],
        }).send(opts));
        console.log('Deployed simpleadapter');

        // link libs to fund (needed to deploy version)
        let fundBytecode = fs.readFileSync('out/Fund.bin');
        const fundAbi = JSON.parse(fs.readFileSync('out/Fund.abi'));
        libObject[getPlaceholderFromPath('out/libraries/rewards')] = rewards.options.address;
        libObject[getPlaceholderFromPath('out/exchange/adapter/simpleAdapter')] = simpleAdapter.options.address;
        fundBytecode = solc.linkBytecode(fundBytecode, libObject);
        fs.writeFileSync('out/Fund.bin', fundBytecode, 'utf8');
        fund = await (new web3.eth.Contract(fundAbi).deploy({
          data: `0x${fundBytecode}`,
          arguments: [
            accounts[0],
            'Genesis',
            mlnAddr,
            0,
            0,
            mlnAddr,
            participation.options.address,
            riskMgmt.options.address,
            sphere.options.address
          ],
        }).send(opts));
        console.log('Deployed fund');

        // update address book
        if(fs.existsSync(addressBookFile)) {
          addressBook = JSON.parse(fs.readFileSync(addressBookFile));
        } else addressBook = {};

        addressBook[environment] = {
          Sphere: sphere.options.address,
          Participation: participation.options.address,
          RMMakeOrders: riskMgmt.options.address,
          rewards: rewards.options.address,
          simpleAdapter: simpleAdapter.options.address,
          fund: fund.options.address,
        };
      }
    } else if(environment === 'development') {
      const preminedAmount = 10 ** 20;

      abi = JSON.parse(fs.readFileSync('./out/assets/PreminedAsset.abi'));
      bytecode = fs.readFileSync('./out/assets/PreminedAsset.bin');
      ethToken = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: ['Ether token', 'ETH-T', 18, preminedAmount],
      }).send(opts));
      console.log('Deployed ether token');

      mlnToken = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: ['Melon token', 'MLN-T', 18, preminedAmount],
      }).send(opts));
      console.log('Deployed melon token');

      eurToken = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: ['Euro token', 'EUR-T', 18, preminedAmount],
      }).send(opts));
      console.log('Deployed euro token');

      mlnAddr = mlnToken.options.address;

      // deploy datafeed
      abi = JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi'));
      bytecode = fs.readFileSync('out/datafeeds/DataFeed.bin');
      datafeed = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [mlnAddr, config.protocol.datafeed.interval, config.protocol.datafeed.validity],
      }).send(opts));
      console.log('Deployed datafeed');

      // deploy simplemarket
      abi = JSON.parse(fs.readFileSync('out/exchange/thirdparty/SimpleMarket.abi'));
      bytecode = fs.readFileSync('out/exchange/thirdparty/SimpleMarket.bin');
      simpleMarket = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed simplemarket');

      // deploy sphere
      abi = JSON.parse(fs.readFileSync('out/sphere/Sphere.abi'));
      bytecode = fs.readFileSync('out/sphere/Sphere.bin');
      sphere = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [
          datafeed.options.address,
          simpleMarket.options.address,
        ],
      }).send(opts));
      console.log('Deployed sphere');

      // deploy participation
      abi = JSON.parse(fs.readFileSync('out/participation/Participation.abi'));
      bytecode = fs.readFileSync('out/participation/Participation.bin');
      participation = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed participation');

      // deploy riskmgmt
      abi = JSON.parse(fs.readFileSync('out/riskmgmt/RMMakeOrders.abi'));
      bytecode = fs.readFileSync('out/riskmgmt/RMMakeOrders.bin');
      riskMgmt = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed riskmgmt');

      // deploy governance
      abi = JSON.parse(fs.readFileSync('out/system/Governance.abi'));
      bytecode = fs.readFileSync('out/system/Governance.bin');
      governance = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [mlnAddr],
      }).send(opts));
      console.log('Deployed governance');

      // deploy rewards
      abi = JSON.parse(fs.readFileSync('out/libraries/rewards.abi'));
      bytecode = fs.readFileSync('out/libraries/rewards.bin');
      rewards = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed rewards');

      // deploy simpleAdapter
      abi = JSON.parse(fs.readFileSync('out/exchange/adapter/simpleAdapter.abi'));
      bytecode = fs.readFileSync('out/exchange/adapter/simpleAdapter.bin');
      simpleAdapter = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [],
      }).send(opts));
      console.log('Deployed simpleadapter');

      // link libs to fund (needed to deploy version)
      let fundBytecode = fs.readFileSync('out/Fund.bin', 'utf8');
      libObject[getPlaceholderFromPath('out/libraries/rewards')] = rewards.options.address;
      libObject[getPlaceholderFromPath('out/exchange/adapter/simpleAdapter')] = simpleAdapter.options.address;
      fundBytecode = solc.linkBytecode(fundBytecode, libObject);
      fs.writeFileSync('out/Fund.bin', fundBytecode, 'utf8');

      // deploy version (can use identical libs object as above)
      const versionAbi = JSON.parse(fs.readFileSync('out/version/Version.abi', 'utf8'));
      let versionBytecode = fs.readFileSync('out/version/Version.bin', 'utf8');
      versionBytecode = solc.linkBytecode(versionBytecode, libObject);
      fs.writeFileSync('out/version/Version.bin', versionBytecode, 'utf8');
      version = await (new web3.eth.Contract(versionAbi).deploy({
        data: `0x${versionBytecode}`,
        arguments: [
          pkgInfo.version,
          governance.options.address,
          mlnAddr
        ],
      }).send(opts));
      console.log('Deployed version');

      // deploy fund to test with
      abi = JSON.parse(fs.readFileSync('out/Fund.abi'));
      bytecode = fs.readFileSync('out/Fund.bin', 'utf8');
      libObject = {};
      libObject[getPlaceholderFromPath('out/libraries/rewards')] = rewards.options.address;
      libObject[getPlaceholderFromPath('out/exchange/adapter/simpleAdapter')] = simpleAdapter.options.address;
      bytecode = solc.linkBytecode(bytecode, libObject);
      const fund = await (new web3.eth.Contract(abi).deploy({
        data: `0x${bytecode}`,
        arguments: [
          accounts[1],
          'Melon Portfolio',                // name
          mlnToken.options.address,         // reference asset
          0,                                // management reward
          0,                                // performance reward
          mlnToken.options.address,         // melon asset
          participation.options.address,    // participation
          riskMgmt.options.address,         // riskMgmt
          sphere.options.address,           // sphere
        ],
      }).send({from: accounts[0], gas: config.gas}));
      console.log('Deployed fund');

      // register assets
      await datafeed.methods.register(
        ethToken.options.address, 'Ether token', 'ETH-T', 18, 'ethereum.org',
        mockBytes, mockBytes, mockAddress, mockAddress
      ).send(opts);
      await datafeed.methods.register(
        eurToken.options.address, 'Euro token', 'EUR-T', 18, 'europa.eu',
        mockBytes, mockBytes, mockAddress, mockAddress
      ).send(opts);
      await datafeed.methods.register(
        mlnToken.options.address, 'Melon token', 'MLN-T', 18, 'melonport.com',
        mockBytes, mockBytes, mockAddress, mockAddress
      ).send(opts);
      console.log('Done registration');

      // update address book
      if(fs.existsSync(addressBookFile)) {
        addressBook = JSON.parse(fs.readFileSync(addressBookFile));
      } else addressBook = {};

      addressBook[environment] = {
        DataFeed: datafeed.options.address,
        SimpleMarket: simpleMarket.options.address,
        Sphere: sphere.options.address,
        Participation: participation.options.address,
        RMMakeOrders: riskMgmt.options.address,
        Governance: governance.options.address,
        rewards: rewards.options.address,
        simpleAdapter: simpleAdapter.options.address,
        Version: version.options.address,
        MlnToken: mlnToken.options.address,
        EurToken: eurToken.options.address,
        EthToken: ethToken.options.address,
        Fund: fund.options.address,
      };
    }

    // write out addressBook
    console.log(`Writing addresses to ${addressBookFile}`);
    fs.writeFileSync(addressBookFile, JSON.stringify(addressBook, null, '\t'), 'utf8');
  } catch (err) { console.log(err.stack); }
}

if (require.main === module) {
  if (process.argv.length < 2) {
    throw new Error(`Please specify a deployment environment`);
  } else {
    deploy(process.argv[2]);
  }
}
