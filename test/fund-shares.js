import Api from "@parity/api";

const addressBook = require("../address-book.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../deployment/environment.config.js");
const fs = require("fs");
const rp = require("request-promise");

// TODO: should we have a separate token config for development network? much of the information is identical
const tokenInfo = require("../deployment/token.info.js").kovan;

const environment = "development";
const apiPath = "https://min-api.cryptocompare.com/data/price";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// TODO: factor out redundant assertions
// TODO: factor out tests into multiple files
describe("Fund shares", () => {
  // Using contract name directly instead of nameContract as in other tests as they are already deployed
  let accounts;
  let deployer;
  let gasPrice;
  let manager;
  let investor;
  let opts;
  let datafeed;
  let simpleMarket;
  let mlnToken;
  let ethToken;
  let eurToken;
  let participation;
  let receipt;
  let runningGasTotal;
  let fund;
  let worker;
  let version;

  const addresses = addressBook[environment];

  beforeEach(() => {
    runningGasTotal = new BigNumber(0);
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 9999999; // datafeed updates take a few seconds
  });

  beforeAll(async () => {
    accounts = await api.eth.accounts();
    gasPrice = Number(await api.eth.gasPrice());
    deployer = accounts[0];
    manager = accounts[1];
    investor = accounts[2];
    worker = accounts[3];
    opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };

    // retrieve deployed contracts
    version = await api.newContract(
      JSON.parse(fs.readFileSync("out/version/Version.abi")),
      addresses.Version,
    );
    datafeed = await api.newContract(
      JSON.parse(fs.readFileSync("out/datafeeds/DataFeed.abi")),
      addresses.DataFeed,
    );
    mlnToken = await api.newContract(
      JSON.parse(fs.readFileSync("out/assets/PreminedAsset.abi")),
      addresses.MlnToken,
    );
    ethToken = await api.newContract(
      JSON.parse(fs.readFileSync("out/assets/PreminedAsset.abi")),
      addresses.EthToken,
    );
    eurToken = await api.newContract(
      JSON.parse(fs.readFileSync("out/assets/PreminedAsset.abi")),
      addresses.EurToken,
    );
    participation = await api.newContract(
      JSON.parse(fs.readFileSync("out/participation/Participation.abi")),
      addresses.Participation,
    );
    simpleMarket = await api.newContract(
      JSON.parse(fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi")),
      addresses.SimpleMarket,
    );
    await participation.instance.attestForIdentity.postTransaction(opts, [investor]); // whitelist investor
  });

  // convenience functions
  function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function updateDatafeed() {
    const fromSymbol = 'MLN';
    const toSymbols = ['ETH', 'EUR', 'MLN'];
    const options = {
      uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
      json: true
    }
    const queryResult = await rp(options);
    const ethDecimals = tokenInfo.filter(token => token.symbol === 'ETH-T')[0].decimals
    const eurDecimals = tokenInfo.filter(token => token.symbol === 'EUR-T')[0].decimals
    const mlnDecimals = tokenInfo.filter(token => token.symbol === 'MLN-T')[0].decimals
    const inverseEth = new BigNumber(1).div(new BigNumber(queryResult.ETH)).toNumber().toFixed(15);
    const inverseEur = new BigNumber(1).div(new BigNumber(queryResult.EUR)).toNumber().toFixed(15);
    const inverseMln = new BigNumber(1).div(new BigNumber(queryResult.MLN)).toNumber().toFixed(15);
    const convertedEth = new BigNumber(inverseEth).div(10 ** (ethDecimals - mlnDecimals)).times(10 ** ethDecimals);
    const convertedEur = new BigNumber(inverseEur).div(10 ** (eurDecimals - mlnDecimals)).times(10 ** eurDecimals);
    const convertedMln = new BigNumber(inverseMln).div(10 ** (mlnDecimals - mlnDecimals)).times(10 ** mlnDecimals);
    await timeout(3000);
    await datafeed.instance.update.postTransaction(
      opts,
      [[ethToken.address, eurToken.address, mlnToken.address],
      [convertedEth, convertedEur, convertedMln]]
    );
  }

  async function getAllBalances() {
    return {
      investor: {
        mlnToken: Number(
          await mlnToken.instance.balanceOf.call({}, [investor]),
        ),
        ethToken: Number(
          await ethToken.instance.balanceOf.call({}, [investor]),
        ),
        ether: new BigNumber(await api.eth.getBalance(investor)),
      },
      manager: {
        mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [manager])),
        ethToken: Number(await ethToken.instance.balanceOf.call({}, [manager])),
        ether: new BigNumber(await api.eth.getBalance(manager)),
      },
      fund: {
        mlnToken: Number(
          await mlnToken.instance.balanceOf.call({}, [fund.address]),
        ),
        ethToken: Number(
          await ethToken.instance.balanceOf.call({}, [fund.address]),
        ),
        ether: new BigNumber(await api.eth.getBalance(fund.address)),
      },
      worker: {
        mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [worker])),
        ethToken: Number(await ethToken.instance.balanceOf.call({}, [worker])),
        ether: new BigNumber(await api.eth.getBalance(worker)),
      },
      deployer: {
        mlnToken: Number(
          await mlnToken.instance.balanceOf.call({}, [deployer]),
        ),
        ethToken: Number(
          await ethToken.instance.balanceOf.call({}, [deployer]),
        ),
        ether: new BigNumber(await api.eth.getBalance(deployer)),
      },
    };
  }

  describe("Setup", async () => {
    it("can set up new fund", async () => {
      const preManagerEth = new BigNumber(await api.eth.getBalance(manager));
      console.log(manager);
      console.log(`Pre manager Eth ${preManagerEth}`);
      const hash = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
      let sig = await api.eth.sign('0x00248D782B4c27b5C6F42FEB3f36918C24b211A5', hash);
      sig = sig.substr(2, sig.length);
      const r = `0x${sig.substr(0, 64)}`;
      const s = `0x${sig.substr(64, 64)}`;
      const v = parseFloat(sig.substr(128, 2)) + 27;
      console.log(v);
      console.log(r);
      console.log(s);
      // await updateDatafeed();
      receipt = await version.instance.setupFund.postTransaction(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice },
        [
          "Melon Portfolio", // name
          addresses.MlnToken, // reference asset
          config.protocol.fund.managementReward,
          config.protocol.fund.performanceReward,
          addresses.Participation,
          addresses.RMMakeOrders,
          addresses.Sphere,
          v,
          r,
          s
        ],
      );
      // Since postTransaction returns transaction hash instead of object as in Web3
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const fundId = await version.instance.getLastFundId.call({}, []);
      const fundAddress = await version.instance.getFundById.call({}, [fundId]);
      fund = await api.newContract(
        JSON.parse(fs.readFileSync("out/Fund.abi")),
        fundAddress,
      );
      const postManagerEth = new BigNumber(await api.eth.getBalance(manager));

      expect(postManagerEth).toEqual(preManagerEth.minus(runningGasTotal.times(gasPrice)));
      expect(Number(fundId)).toEqual(0);

    });

    it("initial calculations", async () => {
      await updateDatafeed();
      const [
        gav,
        managementReward,
        performanceReward,
        unclaimedRewards,
        nav,
        sharePrice,
      ] = Object.values(await fund.instance.performCalculations.call(opts, []));

      expect(Number(gav)).toEqual(0);
      expect(Number(managementReward)).toEqual(0);
      expect(Number(performanceReward)).toEqual(0);
      expect(Number(unclaimedRewards)).toEqual(0);
      expect(Number(nav)).toEqual(0);
      // expect(Number(sharePrice)).toEqual(10 ** 18);
    });
    const initialTokenAmount = 10 ** 14;
    it("investor receives initial mlnToken for testing", async () => {
      const pre = await getAllBalances();
      const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
      receipt = await mlnToken.instance.transfer.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [investor, initialTokenAmount],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
      const post = await getAllBalances();

      expect(postDeployerEth.toString()).toEqual(preDeployerEth.minus(runningGasTotal.times(gasPrice)).toString());
      expect(post.investor.mlnToken).toEqual(
        pre.investor.mlnToken + initialTokenAmount,
      );

      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });
  });

  describe("Subscription : ", async () => {
    // TODO: reduce code duplication between this and subsequent tests
    // split first and subsequent tests due to differing behaviour
    const firstTest = {
      wantedShares: 20000,
      offeredValue: 20000,
      incentive: 100,
    };
    const subsequentTests = [
      { wantedShares: 20143783, offeredValue: 30000000, incentive: 5000 },
      { wantedShares: 500, offeredValue: 2000, incentive: 5000 },
    ];
    it("allows request and execution without datafeed updates on the first subscription", async () => {
      let investorGasTotal = new BigNumber(0);
      let workerGasTotal = new BigNumber(0);
      const pre = await getAllBalances();
      receipt = await fund.instance.requestSubscription.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [firstTest.offeredValue, firstTest.wantedShares, firstTest.incentive],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const inputAllowance = firstTest.offeredValue + firstTest.incentive;
      const fundPreAllowance = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address]),
      );
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, inputAllowance],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const fundPostAllowance = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address]),
      );
      const baseUnits = await fund.instance.getBaseUnits.call({}, []);
      const sharePrice = await fund.instance.calcSharePrice.call({}, []);
      const requestedSharesTotalValue =
        firstTest.wantedShares * sharePrice / baseUnits;
      const offerRemainder = firstTest.offeredValue - requestedSharesTotalValue;
      const investorPreShares = Number(
        await fund.instance.balanceOf.call({}, [investor]),
      );
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      receipt = await fund.instance.executeRequest.postTransaction(
        { from: worker, gas: config.gas, gasPrice: config.gasPrice },
        [requestId],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      workerGasTotal = workerGasTotal.plus(gasUsed);
      const investorPostShares = Number(
        await fund.instance.balanceOf.call({}, [investor]),
      );
      // reduce leftover allowance of investor to zero
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, 0],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const remainingApprovedMln = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address]),
      );
      const post = await getAllBalances();

      expect(remainingApprovedMln).toEqual(0);
      expect(Number(investorPostShares)).toEqual(
        investorPreShares + firstTest.wantedShares,
      );

      expect(fundPostAllowance).toEqual(fundPreAllowance + inputAllowance);
      expect(post.worker.mlnToken).toEqual(
        pre.worker.mlnToken + firstTest.incentive,
      );

      expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
      expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
      expect(post.investor.mlnToken).toEqual(
        pre.investor.mlnToken -
          firstTest.incentive -
          firstTest.offeredValue +
          offerRemainder,
      );

      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.mlnToken).toEqual(
        pre.fund.mlnToken + firstTest.offeredValue - offerRemainder,
      );

      expect(post.fund.ether).toEqual(pre.fund.ether);
      });
    subsequentTests.forEach((test, index) => {
      describe(`request and execution, round ${index + 2}`, async () => {
        let fundPreCalculations;
        let offerRemainder;
        beforeAll(async () => {
          fundPreCalculations = Object.values(
            await fund.instance.performCalculations.call(opts, []),
          );
        });

        afterAll(async () => {
          fundPreCalculations = [];
        });

        it("funds approved, and subscribe request issued, but tokens do not change ownership", async () => {
          const pre = await getAllBalances();
          const inputAllowance = test.offeredValue + test.incentive;
          const fundPreAllowance = Number(
            await mlnToken.instance.allowance.call({}, [
              investor,
              fund.address,
            ]),
          );
          receipt = await mlnToken.instance.approve.postTransaction(
            { from: investor, gasPrice: config.gasPrice },
            [fund.address, inputAllowance],
          );
          let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          runningGasTotal = runningGasTotal.plus(gasUsed);
          const fundPostAllowance = Number(
            await mlnToken.instance.allowance.call({}, [
              investor,
              fund.address,
            ]),
          );

          expect(fundPostAllowance).toEqual(fundPreAllowance + inputAllowance);

          receipt = await fund.instance.requestSubscription.postTransaction(
            { from: investor, gas: config.gas, gasPrice: config.gasPrice },
            [test.offeredValue, test.wantedShares, test.incentive],
          );
          gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          runningGasTotal = runningGasTotal.plus(gasUsed);
          const post = await getAllBalances();

          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether.minus(runningGasTotal.times(gasPrice)));
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
          expect(post.fund.ether).toEqual(pre.fund.ether);
        });

        it("logs request event", async () => {
          // const events = await fund.getPastEvents('RequestUpdated');
          // expect(events.length).toEqual(1);
        });

        it("after first subscription, executing subscribe request before pricefeed updates gives error message", async () => {
          const pre = await getAllBalances();
          const requestId = await fund.instance.getLastRequestId.call({}, []);
          const result = await fund.instance.executeRequest.postTransaction(
            { from: worker, gas: config.gas, gasPrice: config.gasPrice },
            [requestId],
          );
          // const message = result.events.ErrorMessage.returnValues.errorMessage;
          const post = await getAllBalances();

          // expect(message).toEqual('ERR: DataFeed Module: Wait at least for two updates before continuing');
          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether);
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
          expect(post.fund.ether).toEqual(pre.fund.ether);
        });

        it("executing subscribe request transfers incentive to worker, shares to investor, and remainder of subscription offer to investor", async () => {
          let investorGasTotal = new BigNumber(0);
          let workerGasTotal = new BigNumber(0);
          await updateDatafeed();
          // await web3.mineBlock();
          await updateDatafeed();
          // await web3.mineBlock();
          const pre = await getAllBalances();
          const baseUnits = await fund.instance.getBaseUnits.call({}, []);
          const sharePrice = await fund.instance.calcSharePrice.call({}, []);
          const requestedSharesTotalValue =
            test.wantedShares * sharePrice / baseUnits;
          offerRemainder = test.offeredValue - requestedSharesTotalValue;
          const investorPreShares = Number(
            await fund.instance.balanceOf.call({}, [investor]),
          );
          const requestId = await fund.instance.getLastRequestId.call({}, []);
          receipt = await fund.instance.executeRequest.postTransaction(
            { from: worker, gas: config.gas, gasPrice: config.gasPrice },
            [requestId],
          );
          let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          workerGasTotal = workerGasTotal.plus(gasUsed);
          const investorPostShares = Number(
            await fund.instance.balanceOf.call({}, [investor]),
          );
          // reduce leftover allowance of investor to zero
          receipt = await mlnToken.instance.approve.postTransaction(
            { from: investor, gasPrice: config.gasPrice },
            [fund.address, 0],
          );
          gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          investorGasTotal = investorGasTotal.plus(gasUsed);
          const remainingApprovedMln = Number(
            await mlnToken.instance.allowance.call({}, [
              investor,
              fund.address,
            ]),
          );
          const post = await getAllBalances();

          expect(remainingApprovedMln).toEqual(0);
          expect(Number(investorPostShares)).toEqual(
            investorPreShares + test.wantedShares,
          );

          expect(post.worker.mlnToken).toEqual(
            pre.worker.mlnToken + test.incentive,
          );

          expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
          expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
          expect(post.investor.mlnToken).toEqual(
            pre.investor.mlnToken -
              test.incentive -
              test.offeredValue +
              offerRemainder,
          );

          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.mlnToken).toEqual(
            pre.fund.mlnToken + test.offeredValue - offerRemainder,
          );

          expect(post.fund.ether).toEqual(pre.fund.ether);
        });

        it("performs calculation correctly", async () => {
          // await web3.mineBlock();
          const [
            preGav,
            preManagementReward,
            prePerformanceReward,
            preUnclaimedRewards,
            preNav,
            preSharePrice,
          ] = fundPreCalculations.map(element => Number(element));
          const [
            postGav,
            postManagementReward,
            postPerformanceReward,
            postUnclaimedRewards,
            postNav,
            postSharePrice,
          ] = Object.values(
            await fund.instance.performCalculations.call({}, []),
          );

          expect(Number(postGav)).toEqual(
            preGav + test.offeredValue - offerRemainder,
          );

          expect(Number(postManagementReward)).toEqual(preManagementReward); // not enough time has passed
          expect(Number(postPerformanceReward)).toEqual(prePerformanceReward);
          expect(Number(postUnclaimedRewards)).toEqual(preUnclaimedRewards);
          expect(Number(postNav)).toEqual(
            preNav + test.offeredValue - offerRemainder,
          );

          expect(Number(postSharePrice)).toEqual(preSharePrice); // no trades have been made
        });
      });
    });
  });

  describe("Redemption : ", async () => {
    const testArray = [
      { wantedShares: 20000, wantedValue: 20000, incentive: 100 },
      { wantedShares: 500, wantedValue: 500, incentive: 500 },
      { wantedShares: 20143783, wantedValue: 2000, incentive: 5000 },
    ];
    testArray.forEach((test, index) => {
      let fundPreCalculations;
      describe(`request and execution, round ${index + 1}`, async () => {
        beforeAll(async () => {
          fundPreCalculations = Object.values(
            await fund.instance.performCalculations.call(opts, []),
          );
        });

        afterAll(async () => {
          fundPreCalculations = [];
        });

        it("investor can request redemption from fund", async () => {
          const pre = await getAllBalances();
          receipt = await mlnToken.instance.approve.postTransaction(
            { from: investor, gasPrice: config.gasPrice },
            [fund.address, test.incentive],
          );
          let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          runningGasTotal = runningGasTotal.plus(gasUsed);
          receipt = await fund.instance.requestRedemption.postTransaction(
            { from: investor, gas: config.gas, gasPrice: config.gasPrice },
            [test.wantedShares, test.wantedValue, test.incentive],
          );
          gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          runningGasTotal = runningGasTotal.plus(gasUsed);
          const post = await getAllBalances();

          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether.minus(runningGasTotal.times(gasPrice)));
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.ether).toEqual(pre.fund.ether);
        });

        it("logs RequestUpdated event", async () => {
          // const events = await fund.getPastEvents('RequestUpdated');
          // expect(events.length).toEqual(1);
        });

        it("executing request moves token from fund to investor, shares annihilated, and incentive to worker", async () => {
          let workerGasTotal = new BigNumber(0);
          let investorGasTotal = new BigNumber(0);
          await updateDatafeed();
          // await web3.mineBlock();
          await updateDatafeed();
          // await web3.mineBlock();
          const pre = await getAllBalances();
          const investorPreShares = Number(
            await fund.instance.balanceOf.call({}, [investor]),
          );
          const preTotalShares = Number(
            await fund.instance.totalSupply.call({}, []),
          );
          const requestId = await fund.instance.getLastRequestId.call({}, []);
          receipt = await fund.instance.executeRequest.postTransaction(
            { from: worker, gas: config.gas, gasPrice: config.gasPrice },
            [requestId],
          );
          let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          workerGasTotal = runningGasTotal.plus(gasUsed);
          // reduce remaining allowance to zero
          receipt = await mlnToken.instance.approve.postTransaction(
            { from: investor, gasPrice: config.gasPrice },
            [fund.address, 0],
          );
          gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          investorGasTotal = runningGasTotal.plus(gasUsed);
          const remainingApprovedMln = Number(
            await mlnToken.instance.allowance.call({}, [
              investor,
              fund.address,
            ]),
          );
          const investorPostShares = Number(
            await fund.instance.balanceOf.call({}, [investor]),
          );
          const postTotalShares = Number(
            await fund.instance.totalSupply.call({}, []),
          );
          const post = await getAllBalances();

          expect(remainingApprovedMln).toEqual(0);
          expect(investorPostShares).toEqual(
            investorPreShares - test.wantedShares,
          );

          expect(post.worker.mlnToken).toEqual(
            pre.worker.mlnToken + test.incentive,
          );

          expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
          expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
          expect(postTotalShares).toEqual(preTotalShares - test.wantedShares);
          expect(post.investor.mlnToken).toEqual(
            pre.investor.mlnToken + test.wantedValue - test.incentive,
          );

          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.mlnToken).toEqual(
            pre.fund.mlnToken - test.wantedValue,
          );

          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.ether).toEqual(pre.fund.ether);
        });

        it("calculations are performed correctly", async () => {
          // await web3.mineBlock();
          const [
            preGav,
            preManagementReward,
            prePerformanceReward,
            preUnclaimedRewards,
            preNav,
            preSharePrice,
          ] = fundPreCalculations.map(element => Number(element));
          const [
            postGav,
            postManagementReward,
            postPerformanceReward,
            postUnclaimedRewards,
            postNav,
            postSharePrice,
          ] = Object.values(
            await fund.instance.performCalculations.call({}, []),
          );

          expect(Number(postGav)).toEqual(preGav - test.wantedValue);
          expect(Number(postManagementReward)).toEqual(preManagementReward); // not enough time has passed
          expect(Number(postPerformanceReward)).toEqual(prePerformanceReward);
          expect(Number(postUnclaimedRewards)).toEqual(preUnclaimedRewards);
          expect(Number(postNav)).toEqual(preNav - test.wantedValue);
          expect(Number(postSharePrice)).toEqual(preSharePrice);
        });
      });
    });
    it("investor has redeemed all shares, and they have been annihilated", async () => {
      const finalInvestorShares = Number(
        await fund.instance.balanceOf.call({}, [investor]),
      );
      const finalTotalShares = Number(
        await fund.instance.totalSupply.call({}, []),
      );

      expect(finalInvestorShares).toEqual(0);
      expect(finalTotalShares).toEqual(0);
    });
  });

  describe("Trading", async () => {
    const incentive = 500;
    const offeredValue = 10 ** 10;
    const wantedShares = 10 ** 10;
    const trade1 = {
      sellQuantity: 1000,
      buyQuantity: 1000,
    };
    const trade2 = {
      sellQuantity: 500,
      buyQuantity: 1000,
    };
    it("fund receives MLN from a subscription (request & execute)", async () => {
      let investorGasTotal = new BigNumber(0);
      let workerGasTotal = new BigNumber(0);
      const pre = await getAllBalances();
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, incentive + offeredValue],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      receipt = await fund.instance.requestSubscription.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [offeredValue, wantedShares, incentive],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed)
      await updateDatafeed();
      // await web3.mineBlock();
      await updateDatafeed();
      // await web3.mineBlock();
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      receipt = await fund.instance.executeRequest.postTransaction(
        { from: worker, gas: config.gas, gasPrice: config.gasPrice },
        [requestId],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      workerGasTotal = workerGasTotal.plus(gasUsed);
      const post = await getAllBalances();

      expect(post.worker.mlnToken).toEqual(pre.worker.mlnToken + incentive);
      expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
      expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
      expect(post.investor.mlnToken).toEqual(
        pre.investor.mlnToken - offeredValue - incentive,
      );

      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken + offeredValue);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });

    it("manager makes order, and sellToken (MLN-T) is transferred to exchange", async () => {
      const pre = await getAllBalances();
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      await updateDatafeed();
      const price = await datafeed.instance.getReferencePrice.call({}, [
        mlnToken.address,
        ethToken.address,
      ]);
      receipt = await fund.instance.makeOrder.postTransaction(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice },
        [
          mlnToken.address,
          ethToken.address,
          trade1.sellQuantity,
          trade1.buyQuantity,
        ],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const post = await getAllBalances();

      expect(exchangePostMln).toEqual(exchangePreMln + trade1.sellQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.fund.mlnToken).toEqual(
        pre.fund.mlnToken - trade1.sellQuantity,
      );

      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });

    it("third party takes entire order, allowing fund to receive ethToken", async () => {
      const pre = await getAllBalances();
      const orderId = await simpleMarket.instance.last_offer_id.call({}, []);
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      receipt = await ethToken.instance.approve.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [simpleMarket.address, trade1.buyQuantity],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      receipt = await simpleMarket.instance.buy.postTransaction(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
        [orderId, trade1.buyQuantity],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const post = await getAllBalances();
      expect(exchangePostMln).toEqual(exchangePreMln - trade1.buyQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.deployer.ether).toEqual(pre.deployer.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.deployer.mlnToken).toEqual(
        pre.deployer.mlnToken + trade1.sellQuantity,
      );

      expect(post.deployer.ethToken).toEqual(
        pre.deployer.ethToken - trade1.buyQuantity,
      );

      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(
        pre.fund.ethToken + trade1.buyQuantity,
      );

      expect(post.fund.ether).toEqual(pre.fund.ether);
      });

    it("third party makes order (sell MLN-T for ETH-T), and MLN-T is transferred to exchange", async () => {
      const pre = await getAllBalances();
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [simpleMarket.address, trade2.sellQuantity],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      receipt = await simpleMarket.instance.offer.postTransaction(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
        [
          trade2.sellQuantity,
          mlnToken.address,
          trade2.buyQuantity,
          ethToken.address,
        ],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const post = await getAllBalances();

      expect(exchangePostMln).toEqual(exchangePreMln + trade2.sellQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.deployer.mlnToken).toEqual(pre.deployer.mlnToken);
      expect(post.deployer.ethToken).toEqual(
        pre.deployer.ethToken - trade2.sellQuantity,
      );

      expect(post.deployer.ether).toEqual(pre.deployer.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });

    it("manager takes order (buys MLN-T for ETH-T)", async () => {
      const pre = await getAllBalances();
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const orderId = await simpleMarket.instance.last_offer_id.call({}, []);
      receipt = await fund.instance.takeOrder.postTransaction(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice },
        [orderId, trade2.sellQuantity],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const post = await getAllBalances();

      expect(exchangePostMln).toEqual(exchangePreMln - trade2.sellQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.deployer.mlnToken).toEqual(pre.deployer.mlnToken); // mlnToken already in escrow
      expect(post.deployer.ethToken).toEqual(
        pre.deployer.ethToken + trade2.buyQuantity,
      );

      expect(post.deployer.ether).toEqual(pre.deployer.ether);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.fund.mlnToken).toEqual(
        pre.fund.mlnToken + trade2.sellQuantity,
      );

      expect(post.fund.ethToken).toEqual(
        pre.fund.ethToken - trade2.buyQuantity,
      );

      expect(post.fund.ether).toEqual(pre.fund.ether);
      });

    describe("Redeeming after trading", async () => {
      const redemptions = [
        { amount: new BigNumber(100000000), incentive: 500 },
        { amount: new BigNumber(150000000), incentive: 500 },
      ];
      redemptions.forEach((redemption, index) => {
        it(`allows redemption ${index + 1}`, async () => {
          let investorGasTotal = new BigNumber(0);
          let workerGasTotal = new BigNumber(0);
          const investorPreShares = Number(
            await fund.instance.balanceOf.call({}, [investor]),
          );
          const preTotalShares = Number(
            await fund.instance.totalSupply.call({}, []),
          );
          const sharePrice = await fund.instance.calcSharePrice.call({}, []);
          const mlnBaseUnits = await fund.instance.getBaseUnits.call({}, []);
          const wantedValue = Number(
            redemption.amount
              .times(sharePrice)
              .dividedBy(mlnBaseUnits)
              .floor(),
          );
          const pre = await getAllBalances();
          receipt = await mlnToken.instance.approve.postTransaction(
            { from: investor, gasPrice: config.gasPrice },
            [fund.address, incentive],
          );
          let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          investorGasTotal = investorGasTotal.plus(gasUsed);
          receipt = await fund.instance.requestRedemption.postTransaction(
            { from: investor, gas: config.gas, gasPrice: config.gasPrice },
            [redemption.amount, wantedValue, incentive],
          );
          gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          investorGasTotal = investorGasTotal.plus(gasUsed);
          await updateDatafeed();
          // await web3.mineBlock();
          await updateDatafeed();
          // await web3.mineBlock();
          const requestId = await fund.instance.getLastRequestId.call({}, []);
          receipt = await fund.instance.executeRequest.postTransaction(
            { from: worker, gas: config.gas, gasPrice: config.gasPrice },
            [requestId],
          );
          gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          workerGasTotal = workerGasTotal.plus(gasUsed);
          // reduce remaining allowance to zero
          receipt = await mlnToken.instance.approve.postTransaction(
            { from: investor, gasPrice: config.gasPrice },
            [fund.address, 0],
          );
          gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
          investorGasTotal = investorGasTotal.plus(gasUsed);
          const remainingApprovedMln = Number(
            await mlnToken.instance.allowance.call({}, [
              investor,
              fund.address,
            ]),
          );
          const investorPostShares = Number(
            await fund.instance.balanceOf.call({}, [investor]),
          );
          const postTotalShares = Number(
            await fund.instance.totalSupply.call({}, []),
          );
          const post = await getAllBalances();

          expect(remainingApprovedMln).toEqual(0);
          expect(postTotalShares).toEqual(preTotalShares - redemption.amount);
          expect(investorPostShares).toEqual(
            investorPreShares - redemption.amount,
          );

          expect(post.worker.mlnToken).toEqual(pre.worker.mlnToken + incentive);
          expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
          expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
          expect(post.investor.mlnToken).toEqual(
            pre.investor.mlnToken + wantedValue - incentive,
          );

          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken - wantedValue);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.ether).toEqual(pre.fund.ether);
        });
      });
    });
  });

  describe("Rewards", async () => {
    it("converts rewards and manager receives them", async () => {
      // await web3.increaseTime(60 * 60 * 24 * 100); // 100 days
      // await web3.mineBlock();
      await updateDatafeed();
      const pre = await getAllBalances();
      const preManagerShares = Number(
        await fund.instance.balanceOf.call({}, [manager]),
      );
      const totalSupply = Number(await fund.instance.totalSupply.call({}, []));
      const [gav, , , unclaimedRewards, ,] = Object.values(
        await fund.instance.performCalculations.call({}, []),
      );
      const shareQuantity = Math.floor(totalSupply * unclaimedRewards / gav);
      receipt = await fund.instance.convertUnclaimedRewards.postTransaction(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice },
        [],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const postManagerShares = Number(
        await fund.instance.balanceOf.call({}, [manager]),
      );
      const post = await getAllBalances();

      expect(postManagerShares).toEqual(preManagerShares + shareQuantity);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });
  });

  describe("Other functions", async () => {
    it("manager can shut down a fund", async () => {
      const pre = await getAllBalances();
      receipt = await fund.instance.shutDown.postTransaction(
        { from: manager, gasPrice: config.gasPrice },
        [],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      const isShutDown = await fund.instance.isShutDown.call({}, []);
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const post = await getAllBalances();

      expect(isShutDown).toBe(true);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });
  });
});
