const fs = require('fs');
const path = require('path');
const solc = require('solc');
const tokenInfo = require('./migrations/config/token_info.js');
const Web3 = require('web3');

function getPlaceholderFromPath(libPath) {
  const libContractName = path.basename(libPath);
  let modifiedPath = libPath.replace('out', 'src');
  modifiedPath = `${modifiedPath}.sol:${libContractName}`;
  return modifiedPath.slice(0, 36);
}

async function main() {
  try {
    const networkName = 'kovan';
    const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
    const accounts = await web3.eth.getAccounts();
    const opts = { from: accounts[0], gas: 6900000 };
    const mlnAddr = tokenInfo[networkName].find(t => t.symbol === 'MLN-T').address;
    const datafeedInterval = 120;
    const datafeedValidity = 60;
    let abi;
    let bytecode;

    // deploy datafeed
    abi = JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi'));
    bytecode = fs.readFileSync('out/datafeeds/DataFeed.bin');
    const datafeed = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [mlnAddr, datafeedInterval, datafeedValidity],
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
    const libObject = {};
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

    // have to mock some data for now
    const mockBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    const mockChainId = '0x86b5eed81d000000000000000000000000000000000000000000000000000000';
    const mockAddress = '0x00360d2b7d240ec0643b6d819ba81a09e40e5bcd';

    // register assets in datafeed
    tokenInfo[networkName].forEach(async (token) => {
      console.log(`Registering ${token.name}`);
      await datafeed.methods.register(
        token.address,
        token.name,
        token.symbol,
        token.decimals,
        token.url,
        mockBytes,
        mockChainId,
        mockAddress,
        mockAddress,
      ).send(opts);
    });

    // write out to JSON
    const addressBook = {
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
    fs.writeFileSync('./address-book.json', JSON.stringify(addressBook, null, '\t'), 'utf8');
  } catch (err) { console.log(err.stack); }
}

if (require.main === module) {
  main();
}
