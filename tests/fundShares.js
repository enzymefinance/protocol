import Api from "@parity/api";
import updateDatafeed, * as deployedUtils from "./utils.js";
import test from 'ava';

const addressBook = require("../address-book.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../utils/config/environmentConfig.js");
const fs = require("fs");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// TODO: factor out tests into multiple files
// Using contract name directly instead of nameContract as in other tests as they are already deployed

// Hoisted variables

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

// Helper functions

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

// Tests

test.beforeEach(async () => {
  runningGasTotal = new BigNumber(0);
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 9999999; // datafeed updates take a few seconds
});

test.before(async () => {
  accounts = await deployedUtils.accounts;
  gasPrice = Number(await api.eth.gasPrice());
  deployer = accounts[0];
  manager = accounts[1];
  investor = accounts[2];
  worker = accounts[3];
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployedUtils.version;
  datafeed = await deployedUtils.datafeed;
  mlnToken = await deployedUtils.mlnToken;
  ethToken = await deployedUtils.ethToken;
  eurToken = await deployedUtils.eurToken;
  participation = await deployedUtils.participation;
  simpleMarket = await deployedUtils.simpleMarket;
});

// unique fundName on each test run
const fundName = "Melon Portfolio" + Math.floor(Math.random() * 1000000) + 1;
test("can set up new fund", async t => {
  const preManagerEth = new BigNumber(await api.eth.getBalance(manager));
  const hash = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  receipt = await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundName, // name
      addresses.MlnToken, // reference asset
      config.protocol.fund.managementReward,
      config.protocol.fund.performanceReward,
      addresses.NoCompliance,
      addresses.RMMakeOrders,
      addresses.PriceFeed,
      addresses.SimpleMarket,
      v,
      r,
      s
    ],
  );
  // Since postTransaction returns transaction hash instead of object as in Web3
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  console.log(gasUsed);
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const fundId = await version.instance.getLastFundId.call({}, []);
  const fundAddress = await version.instance.getFundById.call({}, [fundId]);
  fund = await api.newContract(
    JSON.parse(fs.readFileSync("out/Fund.abi")),
    fundAddress,
  );
  const postManagerEth = new BigNumber(await api.eth.getBalance(manager));

  t.is(postManagerEth, preManagerEth.minus(runningGasTotal.times(gasPrice)));
  t.is(Number(fundId), 0);
  // t.true(await version.instance.fundNameTaken.call({}, [fundName]));
  // t.is(postManagerEth, preManagerEth.minus(runningGasTotal.times(gasPrice)));
});

test("initial calculations", async t => {
  await updateDatafeed();
  const [
    gav,
    managementReward,
    performanceReward,
    unclaimedRewards,
    nav,
    sharePrice,
  ] = Object.values(await fund.instance.performCalculations.call(opts, []));

  t.is(Number(gav), 0);
  t.is(Number(managementReward), 0);
  t.is(Number(performanceReward), 0);
  t.is(Number(unclaimedRewards), 0);
  t.is(Number(nav), 0);
  // t.is(Number(sharePrice), 10 ** 18);
});

const initialTokenAmount = 10 ** 14;
test("investor receives initial mlnToken for testing", async t => {
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

  t.is(postDeployerEth.toString(), preDeployerEth.minus(runningGasTotal.times(gasPrice)).toString());
  t.is(post.investor.mlnToken, pre.investor.mlnToken + initialTokenAmount);
  t.is(post.investor.ethToken, pre.investor.ethToken);
  t.is(post.investor.ether, pre.investor.ether);
  t.is(post.manager.ethToken, pre.manager.ethToken);
  t.is(post.manager.mlnToken, pre.manager.mlnToken);
  t.is(post.investor.ether, pre.investor.ether);
  t.is(post.fund.mlnToken, pre.fund.mlnToken);
  t.is(post.fund.ethToken, pre.fund.ethToken);
  t.is(post.fund.ether, pre.fund.ether);
});

// Subscription
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
test("allows request and execution on the first subscription", async t => {
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
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const requestedSharesTotalValue =
    await fund.instance.toWholeFundUnit.call({}, [firstTest.wantedShares * sharePrice]);
  const offerRemainder = firstTest.offeredValue - requestedSharesTotalValue;
  const investorPreShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );
  await updateDatafeed();
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  receipt = await fund.instance.executeRequest.postTransaction(
    { from: worker, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  console.log(gasUsed);
  const sharePrice2 = await fund.instance.calcSharePrice.call({}, []);
  console.log(sharePrice2);
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

  t.is(remainingApprovedMln, 0);
  t.is(Number(investorPostShares), investorPreShares + firstTest.wantedShares);
  t.is(fundPostAllowance, fundPreAllowance + inputAllowance);
  t.is(post.worker.mlnToken, pre.worker.mlnToken + firstTest.incentive);
  t.is(post.worker.ethToken, pre.worker.ethToken);
  t.is(post.worker.ether, pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
  t.is(post.investor.mlnToken,
    pre.investor.mlnToken -
      firstTest.incentive -
      firstTest.offeredValue +
      offerRemainder,
  );
  t.is(post.investor.ethToken, pre.investor.ethToken);
  t.is(post.investor.ether, pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
  t.is(post.manager.ethToken, pre.manager.ethToken);
  t.is(post.manager.mlnToken, pre.manager.mlnToken);
  t.is(post.manager.ether, pre.manager.ether);
  t.is(post.fund.ethToken, pre.fund.ethToken);
  t.is(post.fund.mlnToken, 
    pre.fund.mlnToken + firstTest.offeredValue - offerRemainder,
  );
  t.is(post.fund.ether, pre.fund.ether);
});

// TODO: see how ava handles forEach testing as below
//subsequentTests.forEach((test, index) => {
//  describe(`request and execution, round ${index + 2}`, async () => {
//    let fundPreCalculations;
//    let offerRemainder;
//    beforeAll(async () => {
//      fundPreCalculations = Object.values(
//        await fund.instance.performCalculations.call(opts, []),
//      );
//    });

//    afterAll(async () => {
//      fundPreCalculations = [];
//    });

//    test("funds approved, and subscribe request issued, but tokens do not change ownership", async () => {
//      const pre = await getAllBalances();
//      const inputAllowance = test.offeredValue + test.incentive;
//      const fundPreAllowance = Number(
//        await mlnToken.instance.allowance.call({}, [
//          investor,
//          fund.address,
//        ]),
//      );
//      receipt = await mlnToken.instance.approve.postTransaction(
//        { from: investor, gasPrice: config.gasPrice },
//        [fund.address, inputAllowance],
//      );
//      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
//      runningGasTotal = runningGasTotal.plus(gasUsed);
//      const fundPostAllowance = Number(
//        await mlnToken.instance.allowance.call({}, [
//          investor,
//          fund.address,
//        ]),
//      );

//      expect(fundPostAllowance).toEqual(fundPreAllowance + inputAllowance);

//      receipt = await fund.instance.requestSubscription.postTransaction(
//        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
//        [test.offeredValue, test.wantedShares, test.incentive],
//      );
//      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
//      runningGasTotal = runningGasTotal.plus(gasUsed);
//      const post = await getAllBalances();

//      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
//      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
//      expect(post.investor.ether).toEqual(pre.investor.ether.minus(runningGasTotal.times(gasPrice)));
//      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
//      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
//      expect(post.manager.ether).toEqual(pre.manager.ether);
//      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
//      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
//      expect(post.fund.ether).toEqual(pre.fund.ether);
//    });

//    test("executing subscribe request transfers incentive to worker, shares to investor, and remainder of subscription offer to investor", async () => {
//      let investorGasTotal = new BigNumber(0);
//      let workerGasTotal = new BigNumber(0);
//      await updateDatafeed();
//      await updateDatafeed();
//      const pre = await getAllBalances();
//      const sharePrice = await fund.instance.calcSharePrice.call({}, []);
//      console.log(sharePrice);
//      //const owned = await fund.instance.ownedAssets.call({}, []);
//      //console.log(owned);
//      let gav = await fund.instance.calcGav.postTransaction({ from: worker, gas: config.gas, gasPrice: config.gasPrice }, []);
//      console.log((await api.eth.getTransactionReceipt(gav)).gasUsed);
//      gav = await fund.instance.calcGav.call({}, []);
//      console.log(gav);
//      const requestedSharesTotalValue =
//        await fund.instance.toWholeFundUnit.call({}, [test.wantedShares * sharePrice]);
//      offerRemainder = test.offeredValue - requestedSharesTotalValue;
//      const investorPreShares = Number(
//        await fund.instance.balanceOf.call({}, [investor]),
//      );
//      const requestId = await fund.instance.getLastRequestId.call({}, []);
//      receipt = await fund.instance.executeRequest.postTransaction(
//        { from: worker, gas: config.gas, gasPrice: config.gasPrice },
//        [requestId],
//      );
//      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
//      console.log(gasUsed);
//      workerGasTotal = workerGasTotal.plus(gasUsed);
//      const investorPostShares = Number(
//        await fund.instance.balanceOf.call({}, [investor]),
//      );
//      // reduce leftover allowance of investor to zero
//      receipt = await mlnToken.instance.approve.postTransaction(
//        { from: investor, gasPrice: config.gasPrice },
//        [fund.address, 0],
//      );
//      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
//      investorGasTotal = investorGasTotal.plus(gasUsed);
//      const remainingApprovedMln = Number(
//        await mlnToken.instance.allowance.call({}, [
//          investor,
//          fund.address,
//        ]),
//      );
//      const post = await getAllBalances();

//      expect(remainingApprovedMln).toEqual(0);
//      expect(Number(investorPostShares)).toEqual(
//        investorPreShares + test.wantedShares,
//      );

//      expect(post.worker.mlnToken).toEqual(
//        pre.worker.mlnToken + test.incentive,
//      );

//      expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
//      expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
//      expect(post.investor.mlnToken).toEqual(
//        pre.investor.mlnToken -
//          test.incentive -
//          test.offeredValue +
//          offerRemainder,
//      );

//      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
//      expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
//      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
//      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
//      expect(post.manager.ether).toEqual(pre.manager.ether);
//      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
//      expect(post.fund.mlnToken).toEqual(
//        pre.fund.mlnToken + test.offeredValue - offerRemainder,
//      );

//      expect(post.fund.ether).toEqual(pre.fund.ether);
//    });

//     test("performs calculation correctly", async () => {
//       const [
//         preGav,
//         preManagementReward,
//         prePerformanceReward,
//         preUnclaimedRewards,
//         preNav,
//         preSharePrice,
//       ] = fundPreCalculations.map(element => Number(element));
//       const [
//         postGav,
//         postManagementReward,
//         postPerformanceReward,
//         postUnclaimedRewards,
//         postNav,
//         postSharePrice,
//       ] = Object.values(
//         await fund.instance.performCalculations.call({}, []),
//       );

//       expect(Number(postGav)).toEqual(
//         preGav + test.offeredValue - offerRemainder,
//       );

//       expect(Number(postManagementReward)).toEqual(preManagementReward); // not enough time has passed
//       expect(Number(postPerformanceReward)).toEqual(prePerformanceReward);
//       expect(Number(postUnclaimedRewards)).toEqual(preUnclaimedRewards);
//       expect(Number(postNav)).toEqual(
//         preNav + test.offeredValue - offerRemainder,
//       );

//       expect(Number(postSharePrice)).toEqual(preSharePrice); // no trades have been made
//     });
//   });
// });

// describe("Redemption : ", async () => {
//   const testArray = [
//     { wantedShares: 20000, wantedValue: 20000, incentive: 100 },
//     { wantedShares: 500, wantedValue: 500, incentive: 500 },
//     { wantedShares: 20143783, wantedValue: 2000, incentive: 5000 },
//   ];
//   testArray.forEach((test, index) => {
//     let fundPreCalculations;
//     describe(`request and execution, round ${index + 1}`, async () => {
//       beforeAll(async () => {
//         fundPreCalculations = Object.values(
//           await fund.instance.performCalculations.call(opts, []),
//         );
//       });

//       afterAll(async () => {
//         fundPreCalculations = [];
//       });

//       test("investor can request redemption from fund", async () => {
//         const pre = await getAllBalances();
//         receipt = await mlnToken.instance.approve.postTransaction(
//           { from: investor, gasPrice: config.gasPrice },
//           [fund.address, test.incentive],
//         );
//         let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
//         runningGasTotal = runningGasTotal.plus(gasUsed);
//         receipt = await fund.instance.requestRedemption.postTransaction(
//           { from: investor, gas: config.gas, gasPrice: config.gasPrice },
//           [test.wantedShares, test.wantedValue, test.incentive],
//         );
//         gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
//         runningGasTotal = runningGasTotal.plus(gasUsed);
//         const post = await getAllBalances();

//         expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
//         expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
//         expect(post.investor.ether).toEqual(pre.investor.ether.minus(runningGasTotal.times(gasPrice)));
//         expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
//         expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
//         expect(post.manager.ether).toEqual(pre.manager.ether);
//         expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
//         expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
//         expect(post.fund.ether).toEqual(pre.fund.ether);
//       });

//       test("logs RequestUpdated event", async () => {
//         // const events = await fund.getPastEvents('RequestUpdated');
//         // expect(events.length).toEqual(1);
//       });

      /*
      test("executing request moves token from fund to investor, shares annihilated, and incentive to worker", async () => {
        let workerGasTotal = new BigNumber(0);
        let investorGasTotal = new BigNumber(0);
        await updateDatafeed();
        await updateDatafeed();
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

      test("calculations are performed correctly", async () => {
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
      */
    // });
  // });
  // test("investor has redeemed all shares, and they have been annihilated", async () => {
    // const finalInvestorShares = Number(
    //   await fund.instance.balanceOf.call({}, [investor]),
    // );
    // const finalTotalShares = Number(
    //   await fund.instance.totalSupply.call({}, []),
    // );

    // expect(finalInvestorShares).toEqual(0);
    // expect(finalTotalShares).toEqual(0);
  // });
// });

/*
describe("Trading", async () => {
  const incentive = 500;
  const offeredValue = 10 ** 10;
  const wantedShares = 10 ** 10;
  let trade1;
  let trade2;
  let trade3;
  let trade4;

  beforeEach(async () => {
    await updateDatafeed();
    const referencePrice = await datafeed.instance.getReferencePrice.call({}, [
      mlnToken.address,
      ethToken.address,
    ]);
    const invertedReferencePrice = await datafeed.instance.getReferencePrice.call({}, [
      ethToken.address,
      mlnToken.address,
    ]);
    const sellQuantity1 = 1000;
    trade1 = {
      sellQuantity: sellQuantity1,
      buyQuantity: Math.round((referencePrice / 10 ** 18) * sellQuantity1),
    };
    const sellQuantity2 = 50;
    trade2 = {
      sellQuantity: sellQuantity2,
      buyQuantity: Math.round((referencePrice / 10 ** 18) * sellQuantity2),
    };
    const sellQuantity3 = 5;
    trade3 = {
      sellQuantity: sellQuantity3,
      buyQuantity: Math.round((invertedReferencePrice / 10 ** 18) * sellQuantity3 / 10),
    };
    const sellQuantity4 = 5;
    trade4 = {
      sellQuantity: sellQuantity4,
      buyQuantity: Math.round((invertedReferencePrice / 10 ** 18) * sellQuantity4 * 1000),
    };
  });

  test("fund receives MLN from a subscription (request & execute)", async () => {
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
    await updateDatafeed();
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

  test("manager makes order, and sellToken (MLN-T) is transferred to exchange", async () => {
    const pre = await getAllBalances();
    const exchangePreMln = Number(
      await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
    );
    const exchangePreEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
    );
    await updateDatafeed();
    const order = await datafeed.instance.getOrderPrice.call({}, [
      mlnToken.address, trade1.sellQuantity, trade1.buyQuantity
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

  test("third party takes entire order, allowing fund to receive ethToken", async () => {
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
      [simpleMarket.address, trade1.buyQuantity + 100],
    );
    let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    receipt = await simpleMarket.instance.buy.postTransaction(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
      [orderId, trade1.sellQuantity],
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

    expect(exchangePostMln).toEqual(exchangePreMln - trade1.sellQuantity);
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

  test("third party makes order (sell MLN-T for ETH-T), and MLN-T is transferred to exchange", async () => {
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

  test("manager takes order (buys MLN-T for ETH-T)", async () => {
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

    test("manager tries to make a bad order (sell ETH-T for MLN-T), RMMakeOrders should prevent this", async () => {
      const pre = await getAllBalances();
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const preOrderId = await simpleMarket.instance.last_offer_id.call({}, []);
      receipt = await fund.instance.makeOrder.postTransaction(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice },
        [
          ethToken.address,
          mlnToken.address,
          trade3.sellQuantity,
          trade3.buyQuantity,
        ],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const post = await getAllBalances();
      const postOrderId = await simpleMarket.instance.last_offer_id.call({}, []);

      expect(preOrderId).toEqual(postOrderId);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.manager.ether).toEqual(pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.fund.ethToken).toEqual(
        pre.fund.ethToken
      );
    });

    test("third party makes order (sell ETH-T for MLN-T) for a bad price, and MLN-T is transferred to exchange", async () => {
      const pre = await getAllBalances();
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [simpleMarket.address]),
      );
      receipt = await ethToken.instance.approve.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [simpleMarket.address, trade4.sellQuantity],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      receipt = await simpleMarket.instance.offer.postTransaction(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
        [
          trade4.sellQuantity,
          ethToken.address,
          trade4.buyQuantity,
          mlnToken.address,
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

      expect(exchangePostMln).toEqual(exchangePreMln);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken + trade4.sellQuantity);
      expect(post.deployer.mlnToken).toEqual(pre.deployer.mlnToken);
      expect(post.deployer.ethToken).toEqual(
        pre.deployer.ethToken - trade4.sellQuantity,
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

    test("manager tried to take a bad order (buys ETH-T for MLN-T), RMMakeOrders should prevent it", async () => {
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
        [orderId, trade4.sellQuantity],
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

      expect(exchangePostMln).toEqual(exchangePreMln);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.deployer.mlnToken).toEqual(pre.deployer.mlnToken); // mlnToken already in escrow
      expect(post.deployer.ethToken).toEqual(pre.deployer.ethToken,);
      expect(post.deployer.ether).toEqual(pre.deployer.ether);
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

  describe("Redeeming after trading", async () => {
    const redemptions = [
      { amount: new BigNumber(100000000), incentive: 500 },
      { amount: new BigNumber(150000000), incentive: 500 },
    ];
    redemptions.forEach((redemption, index) => {
      test(`allows redemption ${index + 1}`, async () => {
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
        await updateDatafeed();
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
  test("converts rewards and manager receives them", async () => {
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
  test("manager can shut down a fund", async () => {
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
*/
