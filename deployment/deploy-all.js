const fs = require('fs');
const path = require('path');
const solc = require('solc');
const Web3 = require('web3');
const environmentConfig = require('./environment.config.js');
const tokenInfo = require('./token.info.js');

function getPlaceholderFromPath(libPath) {
  const libContractName = path.basename(libPath);
  let modifiedPath = libPath.replace('out', 'src');
  modifiedPath = `${modifiedPath}.sol:${libContractName}`;
  return modifiedPath.slice(0, 36);
}

async function deploy(environment) {
  try {
    let abi;
    let bytecode;
    let mlnAddr;
    let mlnToken;
    let eurToken;
    let ethToken;
    const config = environmentConfig[environment];
    const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));
    if((config.networkId !== await web3.eth.net.getId()) && (config.networkId !== '*')) {
      throw new Error(`Deployment for environment ${environment} not defined`);
    }
    const accounts = await web3.eth.getAccounts();
    const opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice, };

    if(environment === 'kovan') {
      mlnAddr = tokenInfo[environment].find(t => t.symbol === 'MLN-T').address;
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
    }

    // deploy datafeed
    abi = JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi'));
    bytecode = fs.readFileSync('out/datafeeds/DataFeed.bin');
    const datafeed = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [mlnAddr, config.protocol.datafeed.interval, config.protocol.datafeed.validity],
    }).send(opts));
    console.log('Deployed datafeed');

    // deploy simplemarket
    abi = JSON.parse(fs.readFileSync('out/exchange/thirdparty/SimpleMarket.abi'));
    bytecode = fs.readFileSync('out/exchange/thirdparty/SimpleMarket.bin');
    const simpleMarket = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed simplemarket');

    // deploy sphere
    abi = JSON.parse(fs.readFileSync('out/sphere/Sphere.abi'));
    bytecode = fs.readFileSync('out/sphere/Sphere.bin');
    const sphere = await (new web3.eth.Contract(abi).deploy({
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
    const participation = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed participation');

    // deploy riskmgmt
    abi = JSON.parse(fs.readFileSync('out/riskmgmt/RMMakeOrders.abi'));
    bytecode = fs.readFileSync('out/riskmgmt/RMMakeOrders.bin');
    const riskMgmt = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed riskmgmt');

    // deploy governance
    abi = JSON.parse(fs.readFileSync('out/governance/Governance.abi'));
    bytecode = fs.readFileSync('out/governance/Governance.bin');
    const governance = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [mlnAddr],
    }).send(opts));
    console.log('Deployed governance');

    // deploy rewards
    abi = JSON.parse(fs.readFileSync('out/libraries/rewards.abi'));
    bytecode = fs.readFileSync('out/libraries/rewards.bin');
    const rewards = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed rewards');

    // deploy simpleAdapter
    abi = JSON.parse(fs.readFileSync('out/exchange/adapter/simpleAdapter.abi'));
    bytecode = fs.readFileSync('out/exchange/adapter/simpleAdapter.bin');
    const simpleAdapter = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed simpleadapter');

    // link libs to fund (needed to deploy version)
    let libObject = {};
    let fundBytecode = fs.readFileSync('out/Fund.bin', 'utf8');
    libObject[getPlaceholderFromPath('out/libraries/rewards')] = rewards.options.address;
    libObject[getPlaceholderFromPath('out/exchange/adapter/simpleAdapter')] = simpleAdapter.options.address;
    fundBytecode = solc.linkBytecode(fundBytecode, libObject);
    fs.writeFileSync('out/Fund.bin', fundBytecode, 'utf8');
    fs.writeFileSync('out/governance/Fund.bin', fundBytecode, 'utf8');

    // deploy version (can use identical libs object as above)
    const versionAbi = JSON.parse(fs.readFileSync('out/governance/Version.abi', 'utf8'));
    let versionBytecode = fs.readFileSync('out/governance/Version.bin', 'utf8');
    versionBytecode = solc.linkBytecode(versionBytecode, libObject);
    const version = await (new web3.eth.Contract(versionAbi).deploy({
      data: `0x${versionBytecode}`,
      arguments: [mlnAddr],
    }).send(opts));

    let addressBook;
    const addressBookFile = './address-book.json';
    if(environment === 'development') {
      // TODO: factor out any redundant step here
      // mock information for development
      const mockBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
      const mockAddress = '0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183';

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
          'Melon Portfolio',  // name
          'MLN-P',            // share symbol
          18,                 // share decimals
          0,                  // management reward
          0,                  // performance reward
          mlnToken.options.address,
          participation.options.address,
          riskMgmt.options.address,
          sphere.options.address,
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

    // TODO: introduce dependency instead of looped await
    if(environment === 'kovan') {
      for(const assetSymbol of config.protocol.registrar.assetsToRegister) {
        console.log(`Registering ${assetSymbol}`);
        const token = tokenInfo[environment].filter(token => token.symbol === assetSymbol)[0];
        await datafeed.methods.register(
          token.address,
          token.name,
          token.symbol,
          token.decimals,
          token.url,
          token.ipfsHash,
          token.chainId,
          token.breakIn,
          token.breakOut,
        ).send(opts).then(() => console.log(`Registered ${assetSymbol}`))
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
    }

    // write out addressBook
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
