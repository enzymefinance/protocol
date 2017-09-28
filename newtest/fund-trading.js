const fs = require('fs');
const environmentConfig = require('../deployment/environment.config.js');
const rpc = require('../utils/rpc.js');
const Web3 = require('web3');

const environment = 'development';
const config = environmentConfig[environment];
const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));

describe('Fund shares', async () => {
  let accounts;
  let datafeed;
  let ethToken;
  let eurToken;
  let fund;
  let investor;
  let manager;
  let mlnToken;
  let opts;
  let participation;
  let riskManagement;
  let simpleMarket;
  let sphere;
  // mock data
  let mockAddress;
  const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
  const makeSellAmount = 10000;
  const makeBuyAmount = 2000;
  const takeSellAmount = 20000;  // sell/buy from maker's perspective
  const takeBuyAmount = 4000;

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    opts = { from: accounts[0], gas: config.gas };
    manager = accounts[1];
    investor = accounts[2];
    mockAddress = accounts[5];
    // deploy supporting contracts
    let abi;
    let bytecode;
    abi = JSON.parse(fs.readFileSync('./out/assets/Asset.abi'));
    bytecode = fs.readFileSync('./out/assets/Asset.bin');
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

    eurToken = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: ['Euro token', 'EUR-T', 18],
    }).send(opts));
    console.log('Deployed euro token');

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

    abi = JSON.parse(fs.readFileSync('out/exchange/thirdparty/SimpleMarket.abi'));
    bytecode = fs.readFileSync('out/exchange/thirdparty/SimpleMarket.bin');
    simpleMarket = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed simple market');

    abi = JSON.parse(fs.readFileSync('out/sphere/Sphere.abi'));
    bytecode = fs.readFileSync('out/sphere/Sphere.bin');
    sphere = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [
        datafeed.options.address,
        simpleMarket.options.address
      ],
    }).send(opts));
    console.log('Deployed sphere');

    abi = JSON.parse(fs.readFileSync('out/riskmgmt/RiskMgmt.abi'));
    bytecode = fs.readFileSync('out/riskmgmt/RiskMgmt.bin');
    riskManagement = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed risk management');

    abi = JSON.parse(fs.readFileSync('out/participation/Participation.abi'));
    bytecode = fs.readFileSync('out/participation/Participation.bin');
    participation = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [],
    }).send(opts));
    console.log('Deployed participation');

    // register assets
    await datafeed.methods.register(
      ethToken.options.address, '', '', 18, '',
      someBytes, someBytes, mockAddress, mockAddress
    ).send(opts);
    await datafeed.methods.register(
      eurToken.options.address, '', '', 18, '',
      someBytes, someBytes, mockAddress, mockAddress
    ).send(opts);
    await datafeed.methods.register(
      mlnToken.options.address, '', '', 18, '',
      someBytes, someBytes, mockAddress, mockAddress
    ).send(opts);
    await datafeed.methods.update(
      [ethToken.options.address, eurToken.options.address, mlnToken.options.address],
      [1000000000000000000, 5091131249363608, 226244343891402714],  // mock data
    ).send(opts);
    console.log('Done registration and updates');

    // TODO: fix out of gas error when deploying Fund
    abi = JSON.parse(fs.readFileSync('out/Fund.abi'));
    bytecode = fs.readFileSync('out/Fund.bin');
    fund = await (new web3.eth.Contract(abi).deploy({
      data: `0x${bytecode}`,
      arguments: [
        accounts[0],
        'Melon Portfolio',  // name
        'MLN-P',            // share symbol
        18,                 // share decimals
        0,                  // mgmt reward
        0,                  // perf reward
        mlnToken.options.address,
        participation.options.address,
        riskManagement.options.address,
        sphere.options.address,
      ],
    }).send(opts));
    console.log('Deployed fund');

    // participation.options.attestForIdentity(investor).send(opts);   // whitelist investor
  });

  // convenience function
  async function getAllBalances() {
    return {
      investor: {
        mlnToken: await mlnToken.methods.balanceOf(investor).call(),
        ethToken: await ethToken.methods.balanceOf(investor).call(),
      },
      manager: {
        mlnToken: await mlnToken.methods.balanceOf(manager).call(),
        ethToken: await ethToken.methods.balanceOf(manager).call(),
      },
      fund: {
        mlnToken: await mlnToken.methods.balanceOf(fund.options.address).call(),
        ethToken: await ethToken.methods.balanceOf(fund.options.address).call(),
      }
    }
  }

  describe('#makeOrder', async () => {
    it('approves token spending for fund', async () => {
      const pre = await getAllBalances();
      await fund.methods.makeOrder(
        mlnToken.address, ethToken.address, makeSellAmount, makeBuyAmount
      ).send({ from: manager });
      const post = await getAllBalances();

      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken - makeSellAmount);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
    });
//    it('makes an order with expected parameters', async () => {
//      const orderId = await fund.methods.getLastOrderId().call();
//      const order = await fund.methods.orders(orderId).call();
//      const exchangeOrderId = await simpleAdapter.methods.getLastOrderId(simpleMarket.options.address);
//
//      assert.equal(order[0].toNumber(), exchangeOrderId.toNumber());
//      assert.equal(order[1], mlnToken.address);
//      assert.equal(order[2], ethToken.address);
//      assert.equal(order[3].toNumber(), makeSellAmt);
//      assert.equal(order[4].toNumber(), makeBuyAmt);
//      // assert.equal(order[5].toNumber(), 0); // TODO fix: Timestamp
//      assert.equal(order[6].toNumber(), 0);
//    });
  });
//
//  describe('#takeOrder', async () => {
//    before('make an order to take', async () => {
//      await mlnToken.approve(simpleMarket.address, takeSellAmt, { from: liquidityProvider }); // make an order to take
//      await simpleMarket.make(
//        mlnToken.address, ethToken.address, takeSellAmt, takeBuyAmt, { from: liquidityProvider },
//      );
//    });
//    it('takes 100% of an order, which transfers tokens correctly', async () => {
//      const id = await simpleAdapter.getLastOrderId(simpleMarket.address);
//      const preMln = await mlnToken.balanceOf(fund.address);
//      const preEth = await ethToken.balanceOf(fund.address);
//      await fund.takeOrder(id, takeSellAmt, { from: manager });
//      const postMln = await mlnToken.balanceOf(fund.address);
//      const postEth = await ethToken.balanceOf(fund.address);
//      assert.equal(postMln.toNumber() - preMln.toNumber(), takeSellAmt);
//      assert.equal(preEth.toNumber() - postEth.toNumber(), takeBuyAmt);
//    });
//  });
});
