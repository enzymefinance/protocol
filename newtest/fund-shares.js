const addressBook = require('../address-book.json');
const BigNumber = require('bignumber.js');
const environmentConfig = require('../deployment/environment.config.js');
const fs = require('fs');
const path = require('path');
const rp = require('request-promise');
const Web3 = require('web3');
// TODO: should we have a separate token config for development network?
const tokenInfo = require('../migrations/config/token_info.js').kovan;

const environment = 'development';
const apiPath = 'https://min-api.cryptocompare.com/data/price';
const config = environmentConfig[environment];
const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));

describe('Fund shares', () => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000; // datafeed updates must take a few seconds
  let accounts;
  let manager;
  let investor;
  let opts;
  let datafeed;
  let mlnToken;
  let ethToken;
  let eurToken;
  let participation;
  let fund;
  let worker;
  let version;

  const addresses = addressBook[environment];

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    manager = accounts[1];
    investor = accounts[2];
    worker = accounts[3];
    opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice, };

    // retrieve deployed contracts
    version = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/governance/Version.abi')), addresses.Version
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

    participation.methods.attestForIdentity(investor).send(opts);   // whitelist investor
  });

  // register block force mining method
  web3.extend({
    methods: [{
      name: 'mineBlock',
      call: 'evm_mine'
    }]
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
      },
      manager: {
        mlnToken: Number(await mlnToken.methods.balanceOf(manager).call()),
        ethToken: Number(await ethToken.methods.balanceOf(manager).call()),
      },
      fund: {
        mlnToken: Number(await mlnToken.methods.balanceOf(fund.options.address).call()),
        ethToken: Number(await ethToken.methods.balanceOf(fund.options.address).call()),
      }
    }
  }

  it('can set up new fund', async () => {
    await updateDatafeed();
    await version.methods.setupFund(
      'Melon Portfolio',  // name
      'MLN-P',            // share symbol
      18,                 // share decimals
      5,                  // management reward
      7,                  // performance reward
      addresses.Participation,
      addresses.RMMakeOrders,
      addresses.Sphere
    ).send({from: manager, gas: 6900000});
    const fundId = await version.methods.getLastFundId().call();
    const fundAddress = await version.methods.getFund(fundId).call();
    fund = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/Fund.abi')), fundAddress
    );

    expect(Number(fundId)).toEqual(0);
  });

  it('initial calculations', async () => {
    const [gav, , , unclaimedRewards, nav, sharePrice] = Object.values(await fund.methods.performCalculations().call(opts));

    expect(Number(gav)).toEqual(0);
    expect(Number(unclaimedRewards)).toEqual(0);
    expect(Number(nav)).toEqual(0);
    expect(Number(sharePrice)).toEqual(10 ** 18);
  });
  const wantedShares = 10000;
  const offeredValue = 10000;
  const incentive = 100;
  const initialTokenAmount = 10000000000;
  it('investor receives initial token from liquidity provider', async () => {
    const pre = await getAllBalances();
    await mlnToken.methods.transfer(investor, initialTokenAmount).send({from: accounts[0]});
    const post = await getAllBalances();

    expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken + initialTokenAmount);
    expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
    expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
    expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
    expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
    expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
  });
  it('subscribe request transfers offer plus incentive to fund contract', async () => {
    const pre = await getAllBalances();
    const inputAllowance = offeredValue + incentive;
    await mlnToken.methods.approve(fund.options.address, inputAllowance).send({from: investor});
    const fundAllowance = await mlnToken.methods.allowance(investor, fund.options.address).call();

    expect(Number(fundAllowance)).toEqual(inputAllowance);

    await fund.methods.requestSubscription(
      wantedShares, offeredValue, incentive
    ).send({from: investor, gas: config.gas});
    const post = await getAllBalances();

    expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken - fundAllowance);
    expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
    expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
    expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
    expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken + Number(fundAllowance));
    expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
  });
  it('logs request event', async () => {
    const events = await fund.getPastEvents('SubscribeRequest');

    expect(events.length).toEqual(1);
  });
  it('executing subscribe request transfers from fund: incentive to worker, shares to investor, and remainder of subscription offer to investor', async () => {
    await updateDatafeed();
    await web3.mineBlock();
    await updateDatafeed();
    await web3.mineBlock();
    const pre = await getAllBalances();
    const workerPreMln = Number(await mlnToken.methods.balanceOf(worker).call());
    const requestId = await fund.methods.getLastRequestId().call();
    await fund.methods.executeRequest(requestId).send({from: worker, gas: 6000000});
    const sharePrice = await fund.methods.calcSharePrice().call();
    const baseUnits = await fund.methods.getBaseUnits().call();
    const requestedSharesTotalValue = wantedShares * sharePrice / baseUnits;
    const offerRemainder = offeredValue - requestedSharesTotalValue;
    const investorShareBalance = await fund.methods.balanceOf(investor).call();
    const remainingApprovedMln = await mlnToken.methods.allowance(investor, fund.options.address).call();
    const post = await getAllBalances();
    const workerPostMln = Number(await mlnToken.methods.balanceOf(worker).call());

    expect(Number(investorShareBalance)).toEqual(wantedShares);
    expect(Number(remainingApprovedMln)).toEqual(0);
    expect(workerPostMln).toEqual(workerPreMln + incentive);
    expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
    expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
    expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
    expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken + offerRemainder);
    expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken - incentive);
    expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
  });
  it('logs share creation', async () => {
    const events = await fund.getPastEvents('Subscribed');

    expect(events.length).toEqual(1);
  });
  it('performs calculation correctly', async () => {
    await web3.mineBlock();
    const [gav, , , unclaimedRewards, nav, sharePrice] = Object.values(
      await fund.methods.performCalculations().call()
    );

    expect(Number(gav)).toEqual(offeredValue);
    expect(Number(unclaimedRewards)).toEqual(0);
    expect(Number(nav)).toEqual(offeredValue);
    expect(Number(sharePrice)).toEqual(10 ** 18);
  });
});
