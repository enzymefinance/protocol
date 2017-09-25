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
    const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
    const accounts = await web3.eth.getAccounts();
    const opts = { from: accounts[0], gas: 7200000 };
    const mlnAddr = tokenInfo['kovan'].find(t => t.symbol === 'MLN-T').address;
    let abi;
    let bytecode;

    // deploy datafeed
    abi = JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi'));
    bytecode = fs.readFileSync('out/datafeeds/DataFeed.bin');
    const datafeed = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [mlnAddr, 120, 60],
    }).send(opts));

    // deploy simplemarket
    abi = JSON.parse(fs.readFileSync('out/exchange/thirdparty/SimpleMarket.abi'));
    bytecode = fs.readFileSync('out/exchange/thirdparty/SimpleMarket.bin');
    const simpleMarket = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));

    // deploy sphere
    abi = JSON.parse(fs.readFileSync('out/sphere/Sphere.abi'));
    bytecode = fs.readFileSync('out/sphere/Sphere.bin');
    const sphere = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [
        datafeed._address,
        simpleMarket._address,
      ],
    }).send(opts));

    // deploy participation
    abi = JSON.parse(fs.readFileSync('out/participation/Participation.abi'));
    bytecode = fs.readFileSync('out/participation/Participation.bin');
    const participation = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));

    // deploy riskmgmt
    abi = JSON.parse(fs.readFileSync('out/riskmgmt/RMMakeOrders.abi'));
    bytecode = fs.readFileSync('out/riskmgmt/RMMakeOrders.bin');
    const riskMgmt = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));

    // deploy governance
    abi = JSON.parse(fs.readFileSync('out/governance/Governance.abi'));
    bytecode = fs.readFileSync('out/governance/Governance.bin');
    const governance = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [mlnAddr],
    }).send(opts));

    // deploy rewards
    abi = JSON.parse(fs.readFileSync('out/libraries/rewards.abi'));
    bytecode = fs.readFileSync('out/libraries/rewards.bin');
    const rewards = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));

    // deploy simpleAdapter
    abi = JSON.parse(fs.readFileSync('out/exchange/adapter/simpleAdapter.abi'));
    bytecode = fs.readFileSync('out/exchange/adapter/simpleAdapter.bin');
    const simpleAdapter = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));

    // link libs to fund (needed to deploy version)
    let libObject = {};
    let fundAbi = JSON.parse(fs.readFileSync('out/Fund.abi'));
    let fundBytecode = fs.readFileSync('out/Fund.bin', 'utf8');
    libObject[getPlaceholderFromPath('out/libraries/rewards')] = rewards._address;
    libObject[getPlaceholderFromPath('out/exchange/adapter/simpleAdapter')] = simpleAdapter._address;
    fundBytecode = solc.linkBytecode(fundBytecode, libObject);
    fs.writeFileSync('out/Fund.bin', fundBytecode, 'utf8');

    // deploy version (can use identical libs object as above)
    const versionAbi = JSON.parse(fs.readFileSync('out/governance/Version.abi', 'utf8'));
    let versionBytecode = fs.readFileSync('out/governance/Version.bin', 'utf8');
    versionBytecode = solc.linkBytecode(versionBytecode, libObject);
    console.log(versionBytecode);
    fs.writeFileSync('out/governance/Fund.bin', versionBytecode, 'utf8');
    const version = await (new web3.eth.Contract(versionAbi).deploy({
      data: `0x${versionBytecode}`,
      arguments: [mlnAddr],
    }).send(opts));

    // register assets in datafeed
    Object.values(tokenInfo).forEach(async (token) => {
      console.log(`Registering ${token.name}`);
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
      ).send(opts);
    });

    // write out to JSON
    addressBook = {
      DataFeed: datafeed._address,
      SimpleMarket: simpleMarket._address,
      Sphere: sphere._address,
      Participation: participation._address,
      RMMakeOrders: riskMgmt._address,
      Governance: governance._address,
      rewards: rewards._address,
      simpleAdapter: simpleAdapter._address,
      Version: version._address,
    };
    fs.writeFileSync('./address-book.json', JSON.stringify(addressBook), 'utf8');
  } catch (err) { console.log(err.stack); }
}

if (require.main === module) {
  main();
}
