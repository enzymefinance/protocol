import Api from "@parity/api";

const fs = require("fs");
const environmentConfig = require("../deployment/environmentConfig.js");
const rpc = require("../utils/rpc.js");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

jasmine.DEFAULT_TIMEOUT_INTERVAL = 999999;
describe("Fund shares", async () => {
  let accounts;
  let datafeed;
  let datafeedContract;
  let ethToken;
  let ethTokenContract;
  let eurToken;
  let eurTokenContract;
  let fund;
  let fundContract;
  let investor;
  let manager;
  let mlnToken;
  let mlnTokenContract;
  let opts;
  let participation;
  let participationContract;
  let riskManagement;
  let simpleMarket;
  let simpleMarketContract;
  let sphere;
  // mock data
  let mockAddress;
  const someBytes =
    "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
  const makeSellAmount = 10000;
  const makeBuyAmount = 2000;
  const takeSellAmount = 20000; // sell/buy from maker's perspective
  const takeBuyAmount = 4000;

  beforeAll(async () => {
    accounts = await api.eth.accounts();
    opts = { from: accounts[0], gas: config.gas };
    manager = accounts[1];
    investor = accounts[2];
    mockAddress = accounts[5];
    // deploy supporting contracts
    let abi;
    let bytecode;
    abi = JSON.parse(fs.readFileSync("./out/assets/Asset.abi"));
    bytecode = fs.readFileSync("./out/assets/Asset.bin");
    opts.data = `0x${bytecode}`;
    ethToken = await api
      .newContract(abi)
      .deploy(opts, ["Ether token", "ETH-T", 18]);
    ethTokenContract = await api.newContract(abi, ethToken);
    console.log("Deployed ether token");

    mlnToken = await api
      .newContract(abi)
      .deploy(opts, ["Melon token", "MLN-T", 18]);
    mlnTokenContract = await api.newContract(abi, mlnToken);
    console.log("Deployed melon token");

    eurToken = await api
      .newContract(abi)
      .deploy(opts, ["Euro token", "EUR-T", 18]);
    eurTokenContract = await api.newContract(abi, eurToken);
    console.log("Deployed euro token");

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

    abi = JSON.parse(
      fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi"),
    );
    bytecode = fs.readFileSync("out/exchange/thirdparty/SimpleMarket.bin");
    opts.data = `0x${bytecode}`;
    simpleMarket = await api.newContract(abi).deploy(opts, []);
    simpleMarketContract = await api.newContract(abi, simpleMarket);
    console.log("Deployed simple market");

    abi = JSON.parse(fs.readFileSync("out/sphere/Sphere.abi"));
    bytecode = fs.readFileSync("out/sphere/Sphere.bin");
    opts.data = `0x${bytecode}`;
    sphere = await api
      .newContract(abi)
      .deploy(opts, [datafeed, simpleMarket]);
    console.log("Deployed sphere");

    abi = JSON.parse(fs.readFileSync("out/riskmgmt/RiskMgmt.abi"));
    bytecode = fs.readFileSync("out/riskmgmt/RiskMgmt.bin");
    opts.data = `0x${bytecode}`;
    riskManagement = await api.newContract(abi).deploy(opts, []);
    console.log("Deployed risk management");

    abi = JSON.parse(fs.readFileSync("out/participation/Participation.abi"));
    bytecode = fs.readFileSync("out/participation/Participation.bin");
    opts.data = `0x${bytecode}`;
    participation = await api.newContract(abi).deploy(opts, []);
    participationContract = await api.newContract(abi, participation);
    console.log("Deployed participation");

    // register assets
    await datafeedContract.instance.register.postTransaction(opts, [
      ethToken,
      "",
      "",
      18,
      "",
      someBytes,
      someBytes,
      mockAddress,
      mockAddress,
    ]);

    await datafeedContract.instance.register.postTransaction(opts, [
      eurToken,
      "",
      "",
      18,
      "",
      someBytes,
      someBytes,
      mockAddress,
      mockAddress,
    ]);
    await datafeedContract.instance.register.postTransaction(opts, [
      mlnToken,
      "",
      "",
      18,
      "",
      someBytes,
      someBytes,
      mockAddress,
      mockAddress,
    ]);
    await datafeedContract.instance.update.postTransaction(
      opts,
      [
        [ethToken, eurToken, mlnToken],
        [1000000000000000000, 5091131249363608, 22624434389714],
      ], // mock data
    );
    console.log("Done registration and updates");

    // TODO: fix out of gas error when deploying Fund
    abi = JSON.parse(fs.readFileSync("out/Fund.abi"));
    bytecode = fs.readFileSync("out/Fund.bin");
    opts.data = `0x${bytecode}`;
    opts.gas = 5790000;
    fund = await api.newContract(abi).deploy(
      opts,
      [
        accounts[0],
        "Melon Portfolio", // name
        mlnToken, // share symbol
        0, // mgmt reward
        0, // perf reward
        mlnToken,
        participation,
        riskManagement,
        sphere,
      ],
      () => {},
      true,
    );
    fundContract = await api.newContract(abi, fund);
    console.log("Deployed fund");

    participationContract.instance.attestForIdentity.postTransaction(
      opts,
      [investor],
      () => {},
      true,
    ); // whitelist investor
  });

  // convenience function
  async function getAllBalances() {
    return {
      investor: {
        mlnToken: Number(
          await mlnTokenContract.instance.balanceOf.call({}, [investor]),
        ),
        ethToken: Number(
          await ethTokenContract.instance.balanceOf.call({}, [investor]),
        ),
      },
      manager: {
        mlnToken: Number(
          await mlnTokenContract.instance.balanceOf.call({}, [manager]),
        ),
        ethToken: Number(
          await ethTokenContract.instance.balanceOf.call({}, [manager]),
        ),
      },
      fund: {
        mlnToken: Number(
          await mlnTokenContract.instance.balanceOf.call({}, [fund]),
        ),
        ethToken: Number(
          await ethTokenContract.instance.balanceOf.call({}, [fund]),
        ),
      },
    };
  }

  describe("#makeOrder", async () => {
    it("approves token spending for fund", async () => {
      const pre = await getAllBalances();
      await fundContract.instance.makeOrder.postTransaction(
        { from: manager },
        [mlnToken, ethToken, makeSellAmount, makeBuyAmount],
        () => {},
        true,
      );
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
