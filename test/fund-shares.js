const addressBook = require('../address-book.json');
const BigNumber = require('bignumber.js');
const environmentConfig = require('../deployment/environment.config.js');
const fs = require('fs');
const rp = require('request-promise');
const Web3 = require('web3');
// TODO: should we have a separate token config for development network? much of the information is identical
const tokenInfo = require('../deployment/token.info.js').kovan;

const environment = 'development';
const apiPath = 'https://min-api.cryptocompare.com/data/price';
const config = environmentConfig[environment];
const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));

// TODO: factor out redundant assertions
// TODO: factor out tests into multiple files
describe('Fund shares', () => {
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
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // datafeed updates take a few seconds
  });

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    gasPrice = Number(await web3.eth.getGasPrice());
    deployer = accounts[0];
    manager = accounts[1];
    investor = accounts[2];
    worker = accounts[3];
    opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice, };

    // retrieve deployed contracts
    version = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/version/Version.abi')), addresses.Version
    );
    datafeed = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi')), addresses.DataFeed
    );
    mlnToken = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/assets/PreminedAsset.abi')), addresses.MlnToken
    );
    ethToken = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/assets/PreminedAsset.abi')), addresses.EthToken
    );
    eurToken = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/assets/PreminedAsset.abi')), addresses.EurToken
    );
    participation = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/participation/Participation.abi')), addresses.Participation
    );
    simpleMarket = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/exchange/thirdparty/SimpleMarket.abi')), addresses.SimpleMarket
    );

    participation.methods.attestForIdentity(investor).send(opts);   // whitelist investor
  });

  // register block force mining method
  web3.extend({
    methods: [
      {
        name: 'mineBlock',
        call: 'evm_mine'
      },
      {
        name: 'increaseTime',
        call: 'evm_increaseTime',
        params: 1
      }
    ]
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
    await datafeed.methods.update(
      [ethToken.options.address, eurToken.options.address, mlnToken.options.address],
      [convertedEth, convertedEur, convertedMln],
    ).send(opts);
  }

  async function getAllBalances() {
    return {
      investor: {
        mlnToken: Number(await mlnToken.methods.balanceOf(investor).call()),
        ethToken: Number(await ethToken.methods.balanceOf(investor).call()),
        ether: new BigNumber(await web3.eth.getBalance(investor))
      },
      manager: {
        mlnToken: Number(await mlnToken.methods.balanceOf(manager).call()),
        ethToken: Number(await ethToken.methods.balanceOf(manager).call()),
        ether: new BigNumber(await web3.eth.getBalance(manager))
      },
      fund: {
        mlnToken: Number(await mlnToken.methods.balanceOf(fund.options.address).call()),
        ethToken: Number(await ethToken.methods.balanceOf(fund.options.address).call()),
        ether: new BigNumber(await web3.eth.getBalance(fund.options.address))
      },
      worker: {
        mlnToken: Number(await mlnToken.methods.balanceOf(worker).call()),
        ethToken: Number(await ethToken.methods.balanceOf(worker).call()),
        ether: new BigNumber(await web3.eth.getBalance(worker))
      },
      deployer: {
        mlnToken: Number(await mlnToken.methods.balanceOf(deployer).call()),
        ethToken: Number(await ethToken.methods.balanceOf(deployer).call()),
        ether: new BigNumber(await web3.eth.getBalance(deployer))
      }
    }
  }

  describe('Setup', async () => {
    it('can set up new fund', async () => {
      const preManagerEth = new BigNumber(await web3.eth.getBalance(manager));
      await updateDatafeed();
      receipt = await version.methods.setupFund(
        'Melon Portfolio',  // name
        addresses.MlnToken, // reference asset
        config.protocol.fund.managementReward,
        config.protocol.fund.performanceReward,
        addresses.Participation,
        addresses.RMMakeOrders,
        addresses.Sphere
      ).send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
      const fundId = await version.methods.getLastFundId().call();
      const fundAddress = await version.methods.getFundById(fundId).call();
      fund = await new web3.eth.Contract(
        JSON.parse(fs.readFileSync('out/Fund.abi')), fundAddress
      );
      const postManagerEth = new BigNumber(await web3.eth.getBalance(manager));

      expect(Number(fundId)).toEqual(0);
      expect(postManagerEth).toEqual(preManagerEth.minus(runningGasTotal.times(gasPrice)));
    });
    it('initial calculations', async () => {
      await updateDatafeed();
      const [gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice] = Object.values(await fund.methods.performCalculations().call(opts));

      expect(Number(gav)).toEqual(0);
      expect(Number(managementReward)).toEqual(0);
      expect(Number(performanceReward)).toEqual(0);
      expect(Number(unclaimedRewards)).toEqual(0);
      expect(Number(nav)).toEqual(0);
      expect(Number(sharePrice)).toEqual(10 ** 18);
    });
    const initialTokenAmount = 10 ** 14;
    it('investor receives initial mlnToken for testing', async () => {
      const pre = await getAllBalances();
      const preDeployerEth = new BigNumber(await web3.eth.getBalance(deployer));
      receipt = await mlnToken.methods.transfer(investor, initialTokenAmount).send({from: deployer, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
      const postDeployerEth = new BigNumber(await web3.eth.getBalance(deployer));
      const post = await getAllBalances();

      expect(postDeployerEth.toString()).toEqual(preDeployerEth.minus(runningGasTotal.times(gasPrice)).toString());
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken + initialTokenAmount);
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
  describe('Subscription : ', async () => {
    // TODO: reduce code duplication between this and subsequent tests
    // split first and subsequent tests due to differing behaviour
    const firstTest = { wantedShares: 20000, offeredValue: 20000, incentive: 100 };
    const subsequentTests = [
      { wantedShares: 20143783, offeredValue: 30000000, incentive: 5000 },
      { wantedShares: 500, offeredValue: 2000, incentive: 5000 },
    ];
    it('allows request and execution without datafeed updates on the first subscription', async () => {
      let investorGasTotal = new BigNumber(0);
      let workerGasTotal = new BigNumber(0)
      const pre = await getAllBalances();
      receipt = await fund.methods.requestSubscription(
        firstTest.offeredValue, firstTest.wantedShares, firstTest.incentive
      ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed)
      const inputAllowance = firstTest.offeredValue + firstTest.incentive;
      const fundPreAllowance = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
      receipt = await mlnToken.methods.approve(fund.options.address, inputAllowance).send({from: investor, gasPrice: config.gasPrice});
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed)
      const fundPostAllowance = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
      const baseUnits = await fund.methods.getBaseUnits().call();
      const sharePrice = await fund.methods.calcSharePrice().call();
      const requestedSharesTotalValue = firstTest.wantedShares * sharePrice / baseUnits;
      const offerRemainder = firstTest.offeredValue - requestedSharesTotalValue;
      const investorPreShares = Number(await fund.methods.balanceOf(investor).call());
      const requestId = await fund.methods.getLastRequestId().call();
      receipt = await fund.methods.executeRequest(requestId).send({from: worker, gas: config.gas, gasPrice: config.gasPrice});
      workerGasTotal = workerGasTotal.plus(receipt.gasUsed)
      const investorPostShares = Number(await fund.methods.balanceOf(investor).call());
      // reduce leftover allowance of investor to zero
      receipt = await mlnToken.methods.approve(fund.options.address, 0).send({from: investor, gasPrice: config.gasPrice});
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed)
      const remainingApprovedMln = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
      const post = await getAllBalances();

      expect(remainingApprovedMln).toEqual(0);
      expect(Number(investorPostShares)).toEqual(investorPreShares + firstTest.wantedShares);
      expect(fundPostAllowance).toEqual(fundPreAllowance + inputAllowance);
      expect(post.worker.mlnToken).toEqual(pre.worker.mlnToken + firstTest.incentive);
      expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
      expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken - firstTest.incentive - firstTest.offeredValue + offerRemainder);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken + firstTest.offeredValue - offerRemainder);
      expect(post.fund.ether).toEqual(pre.fund.ether);

    });
    subsequentTests.forEach((test, index) => {
      describe(`request and execution, round ${index + 2}`, async () => {
        let fundPreCalculations;
        let offerRemainder;
        beforeAll(async () => {
          fundPreCalculations = Object.values(await fund.methods.performCalculations().call(opts));
        });
        afterAll(async () => {
          fundPreCalculations = [];
        });
        it('funds approved, and subscribe request issued, but tokens do not change ownership', async () => {
          const pre = await getAllBalances();
          const inputAllowance = test.offeredValue + test.incentive;
          const fundPreAllowance = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
          receipt = await mlnToken.methods.approve(fund.options.address, inputAllowance).send({from: investor, gasPrice: config.gasPrice});
          runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
          const fundPostAllowance = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());

          expect(fundPostAllowance).toEqual(fundPreAllowance + inputAllowance);

          receipt = await fund.methods.requestSubscription(
            test.offeredValue, test.wantedShares, test.incentive
          ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
          runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
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
        it('logs request event', async () => {
          const events = await fund.getPastEvents('RequestUpdated');

          expect(events.length).toEqual(1);
        });
        it('after first subscription, executing subscribe request before pricefeed updates gives error message', async () => {
          const pre = await getAllBalances();
          const requestId = await fund.methods.getLastRequestId().call();
          const result = await fund.methods.executeRequest(requestId).send({from: worker, gas: config.gas, gasPrice: config.gasPrice});
          const message = result.events.ErrorMessage.returnValues.errorMessage;
          const post = await getAllBalances();

          expect(message).toEqual('ERR: DataFeed Module: Wait at least for two updates before continuing');
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
        it('executing subscribe request transfers incentive to worker, shares to investor, and remainder of subscription offer to investor', async () => {
          let investorGasTotal = new BigNumber(0);
          let workerGasTotal = new BigNumber(0)
          await updateDatafeed();
          await web3.mineBlock();
          await updateDatafeed();
          await web3.mineBlock();
          const pre = await getAllBalances();
          const baseUnits = await fund.methods.getBaseUnits().call();
          const sharePrice = await fund.methods.calcSharePrice().call();
          const requestedSharesTotalValue = test.wantedShares * sharePrice / baseUnits;
          offerRemainder = test.offeredValue - requestedSharesTotalValue;
          const investorPreShares = Number(await fund.methods.balanceOf(investor).call());
          const requestId = await fund.methods.getLastRequestId().call();
          receipt = await fund.methods.executeRequest(requestId).send({from: worker, gas: config.gas, gasPrice: config.gasPrice});
          workerGasTotal = workerGasTotal.plus(receipt.gasUsed)
          const investorPostShares = Number(await fund.methods.balanceOf(investor).call());
          // reduce leftover allowance of investor to zero
          receipt = await mlnToken.methods.approve(fund.options.address, 0).send({from: investor, gasPrice: config.gasPrice});
          investorGasTotal = investorGasTotal.plus(receipt.gasUsed)
          const remainingApprovedMln = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
          const post = await getAllBalances();

          expect(remainingApprovedMln).toEqual(0);
          expect(Number(investorPostShares)).toEqual(investorPreShares + test.wantedShares);
          expect(post.worker.mlnToken).toEqual(pre.worker.mlnToken + test.incentive);
          expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
          expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken - test.incentive - test.offeredValue + offerRemainder);
          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken + test.offeredValue - offerRemainder);
          expect(post.fund.ether).toEqual(pre.fund.ether);
        });
        it('performs calculation correctly', async () => {
          await web3.mineBlock();
          const [preGav, preManagementReward, prePerformanceReward, preUnclaimedRewards, preNav, preSharePrice] = fundPreCalculations.map(element => Number(element));
          const [postGav, postManagementReward, postPerformanceReward, postUnclaimedRewards, postNav, postSharePrice] = Object.values(
            await fund.methods.performCalculations().call()
          );

          expect(Number(postGav)).toEqual(preGav + test.offeredValue - offerRemainder);
          expect(Number(postManagementReward)).toEqual(preManagementReward); // not enough time has passed
          expect(Number(postPerformanceReward)).toEqual(prePerformanceReward);
          expect(Number(postUnclaimedRewards)).toEqual(preUnclaimedRewards);
          expect(Number(postNav)).toEqual(preNav + test.offeredValue - offerRemainder);
          expect(Number(postSharePrice)).toEqual(preSharePrice); // no trades have been made
        });
      });
    });
  });
  describe('Redemption : ', async () => {
    const testArray = [
      { wantedShares: 20000, wantedValue: 20000, incentive: 100 },
      { wantedShares: 500, wantedValue: 500, incentive: 500 },
      { wantedShares: 20143783, wantedValue: 2000, incentive: 5000 },
    ];
    testArray.forEach((test, index) => {
      let fundPreCalculations;
      describe(`request and execution, round ${index + 1}`, async () => {
        beforeAll(async () => {
          fundPreCalculations = Object.values(await fund.methods.performCalculations().call(opts));
        });
        afterAll(async () => {
          fundPreCalculations = [];
        });
        it('investor can request redemption from fund', async () => {
          const pre = await getAllBalances();
          receipt = await mlnToken.methods.approve(
            fund.options.address, test.incentive
          ).send({from: investor, gasPrice: config.gasPrice});
          runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
          receipt = await fund.methods.requestRedemption(
            test.wantedShares, test.wantedValue, test.incentive
          ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
          runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
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
        it('logs RequestUpdated event', async () => {
          const events = await fund.getPastEvents('RequestUpdated');

          expect(events.length).toEqual(1);
        });
        it('executing request moves token from fund to investor, shares annihilated, and incentive to worker', async () => {
          let workerGasTotal = new BigNumber(0);
          let investorGasTotal = new BigNumber(0);
          await updateDatafeed();
          await web3.mineBlock();
          await updateDatafeed();
          await web3.mineBlock();
          const pre = await getAllBalances();
          const investorPreShares = Number(await fund.methods.balanceOf(investor).call());
          const preTotalShares = Number(await fund.methods.totalSupply().call());
          const requestId = await fund.methods.getLastRequestId().call();
          receipt = await fund.methods.executeRequest(requestId).send({from: worker, gas: config.gas, gasPrice: config.gasPrice});
          workerGasTotal = runningGasTotal.plus(receipt.gasUsed);
          // reduce remaining allowance to zero
          receipt = await mlnToken.methods.approve(fund.options.address, 0).send({from: investor, gasPrice: config.gasPrice});
          investorGasTotal = runningGasTotal.plus(receipt.gasUsed);
          const remainingApprovedMln = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
          const investorPostShares = Number(await fund.methods.balanceOf(investor).call());
          const postTotalShares = Number(await fund.methods.totalSupply().call());
          const post = await getAllBalances();

          expect(remainingApprovedMln).toEqual(0);
          expect(investorPostShares).toEqual(investorPreShares - test.wantedShares);
          expect(post.worker.mlnToken).toEqual(pre.worker.mlnToken + test.incentive);
          expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
          expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
          expect(postTotalShares).toEqual(preTotalShares - test.wantedShares);
          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken + test.wantedValue - test.incentive);
          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.manager.ether).toEqual(pre.manager.ether);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken - test.wantedValue);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
          expect(post.fund.ether).toEqual(pre.fund.ether);
        });
        it('calculations are performed correctly', async () => {
          await web3.mineBlock();
          const [preGav, preManagementReward, prePerformanceReward, preUnclaimedRewards, preNav, preSharePrice] = fundPreCalculations.map(element => Number(element));
          const [postGav, postManagementReward, postPerformanceReward, postUnclaimedRewards, postNav, postSharePrice] = Object.values(
            await fund.methods.performCalculations().call()
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
    it('investor has redeemed all shares, and they have been annihilated', async () => {
      const finalInvestorShares = Number(await fund.methods.balanceOf(investor).call());
      const finalTotalShares = Number(await fund.methods.totalSupply().call());

      expect(finalInvestorShares).toEqual(0);
      expect(finalTotalShares).toEqual(0);
    });
  });
  describe('Trading', async () => {
    const incentive = 500;
    const offeredValue = 10 ** 10;
    const wantedShares = 10 ** 10;
    const trade1 = {
      sellQuantity: 1000,
      buyQuantity: 1000
    }
    const trade2 = {
      sellQuantity: 500,
      buyQuantity: 1000
    }
    it('fund receives MLN from a subscription (request & execute)', async () => {
      let investorGasTotal = new BigNumber(0);
      let workerGasTotal = new BigNumber(0);
      const pre = await getAllBalances();
      receipt = await mlnToken.methods.approve(
        fund.options.address, incentive + offeredValue
      ).send({from: investor, gasPrice: config.gasPrice});
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed)
      receipt = await fund.methods.requestSubscription(
        offeredValue, wantedShares, incentive
      ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed)
      await updateDatafeed();
      await web3.mineBlock();
      await updateDatafeed();
      await web3.mineBlock();
      const requestId = await fund.methods.getLastRequestId().call();
      receipt = await fund.methods.executeRequest(requestId).send({from: worker, gas: config.gas, gasPrice: config.gasPrice});
      workerGasTotal = workerGasTotal.plus(receipt.gasUsed)
      const post = await getAllBalances();

      expect(post.worker.mlnToken).toEqual(pre.worker.mlnToken + incentive);
      expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
      expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken - offeredValue - incentive);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken + offeredValue);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });
    it('manager makes order, and sellToken (MLN-T) is transferred to exchange', async () => {
      const pre = await getAllBalances();
      const exchangePreMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePreEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      receipt = await fund.methods.makeOrder(
        mlnToken.options.address, ethToken.options.address, trade1.sellQuantity, trade1.buyQuantity
      ).send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
      const exchangePostMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePostEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      const post = await getAllBalances();

      expect(exchangePostMln).toEqual(exchangePreMln + trade1.sellQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken - trade1.sellQuantity);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });
    it('third party takes entire order, allowing fund to receive ethToken', async () => {
      const pre = await getAllBalances();
      const orderId = await simpleMarket.methods.last_offer_id().call();
      const exchangePreMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePreEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      receipt = await ethToken.methods.approve(simpleMarket.options.address, trade1.buyQuantity).send({from: deployer, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
      receipt = await simpleMarket.methods.buy(
        orderId, trade1.buyQuantity
      ).send({from: deployer, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
      const exchangePostMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePostEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      const post = await getAllBalances();

      expect(exchangePostMln).toEqual(exchangePreMln - trade1.buyQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.deployer.ether).toEqual(pre.deployer.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.deployer.mlnToken).toEqual(pre.deployer.mlnToken + trade1.sellQuantity);
      expect(post.deployer.ethToken).toEqual(pre.deployer.ethToken - trade1.buyQuantity);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken + trade1.buyQuantity);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });
    it('third party makes order (sell MLN-T for ETH-T), and MLN-T is transferred to exchange', async () => {
      const pre = await getAllBalances();
      const exchangePreMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePreEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      receipt = await mlnToken.methods.approve(simpleMarket.options.address, trade2.sellQuantity).send({from: deployer, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      receipt = await simpleMarket.methods.offer(
        trade2.sellQuantity, mlnToken.options.address, trade2.buyQuantity, ethToken.options.address
      ).send({from: deployer, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      const exchangePostMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePostEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      const post = await getAllBalances();

      expect(exchangePostMln).toEqual(exchangePreMln + trade2.sellQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.deployer.mlnToken).toEqual(pre.deployer.mlnToken);
      expect(post.deployer.ethToken).toEqual(pre.deployer.ethToken - trade2.sellQuantity);
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
    it('manager takes order (buys MLN-T for ETH-T)', async () => {
      const pre = await getAllBalances();
      const exchangePreMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePreEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      const orderId = await simpleMarket.methods.last_offer_id().call();
      receipt = await fund.methods.takeOrder(
        orderId, trade2.sellQuantity
      ).send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
      const exchangePostMln = Number(await mlnToken.methods.balanceOf(simpleMarket.options.address).call());
      const exchangePostEthToken = Number(await ethToken.methods.balanceOf(simpleMarket.options.address).call());
      const post = await getAllBalances();

      expect(exchangePostMln).toEqual(exchangePreMln - trade2.sellQuantity);
      expect(exchangePostEthToken).toEqual(exchangePreEthToken);
      expect(post.deployer.mlnToken).toEqual(pre.deployer.mlnToken); // mlnToken already in escrow
      expect(post.deployer.ethToken).toEqual(pre.deployer.ethToken + trade2.buyQuantity);
      expect(post.deployer.ether).toEqual(pre.deployer.ether);
      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.investor.ether).toEqual(pre.investor.ether);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.manager.ether).toEqual(pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken + trade2.sellQuantity);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken - trade2.buyQuantity);
      expect(post.fund.ether).toEqual(pre.fund.ether);
    });
    describe('Redeeming after trading', async () => {
      const redemptions = [
        { amount: new BigNumber(100000000), incentive: 500 },
        { amount: new BigNumber(150000000), incentive: 500 }
      ];
      redemptions.forEach((redemption, index) => {
        it(`allows redemption ${index + 1}`, async () => {
          let investorGasTotal = new BigNumber(0);
          let workerGasTotal = new BigNumber(0);
          const investorPreShares = Number(await fund.methods.balanceOf(investor).call());
          const preTotalShares = Number(await fund.methods.totalSupply().call());
          const sharePrice = await fund.methods.calcSharePrice().call();
          const mlnBaseUnits = await fund.methods.getBaseUnits().call();
          const wantedValue = Number(redemption.amount.times(sharePrice).dividedBy(mlnBaseUnits).floor());
          const pre = await getAllBalances();
          receipt = await mlnToken.methods.approve(
            fund.options.address, incentive
          ).send({from: investor, gasPrice: config.gasPrice});
          investorGasTotal = investorGasTotal.plus(receipt.gasUsed)
          receipt = await fund.methods.requestRedemption(
            redemption.amount, wantedValue, incentive
          ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
          investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
          await updateDatafeed();
          await web3.mineBlock();
          await updateDatafeed();
          await web3.mineBlock();
          const requestId = await fund.methods.getLastRequestId().call();
          receipt = await fund.methods.executeRequest(requestId).send({from: worker, gas: config.gas, gasPrice: config.gasPrice});
          workerGasTotal = workerGasTotal.plus(receipt.gasUsed);
          // reduce remaining allowance to zero
          receipt = await mlnToken.methods.approve(fund.options.address, 0).send({from: investor, gasPrice: config.gasPrice});
          investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
          const remainingApprovedMln = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
          const investorPostShares = Number(await fund.methods.balanceOf(investor).call());
          const postTotalShares = Number(await fund.methods.totalSupply().call());
          const post = await getAllBalances();

          expect(remainingApprovedMln).toEqual(0);
          expect(postTotalShares).toEqual(preTotalShares - redemption.amount);
          expect(investorPostShares).toEqual(investorPreShares - redemption.amount);
          expect(post.worker.mlnToken).toEqual(pre.worker.mlnToken + incentive);
          expect(post.worker.ethToken).toEqual(pre.worker.ethToken);
          expect(post.worker.ether).toEqual(pre.worker.ether.minus(workerGasTotal.times(gasPrice)));
          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken + wantedValue - incentive);
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
  describe('Rewards', async () => {
    it('converts rewards and manager receives them', async () => {
      await web3.increaseTime(60 * 60 * 24 * 100); // 100 days
      await web3.mineBlock();
      await updateDatafeed();
      const pre = await getAllBalances();
      const preManagerShares = Number(await fund.methods.balanceOf(manager).call());
      const totalSupply = Number(await fund.methods.totalSupply().call());
      const [gav, , , unclaimedRewards, , ] = 
        Object.values(await fund.methods.performCalculations().call());
      const shareQuantity = Math.floor(totalSupply * unclaimedRewards / gav);
      receipt = await fund.methods.convertUnclaimedRewards().send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
      const postManagerShares = Number(await fund.methods.balanceOf(manager).call());
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
  describe('Other functions', async () => {
    it('manager can shut down a fund', async () => {
      const pre = await getAllBalances();
      receipt = await fund.methods.shutDown().send({from: manager, gasPrice: config.gasPrice});
      const isShutDown = await fund.methods.isShutDown().call();
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed)
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
