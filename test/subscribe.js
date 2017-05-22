const assert = require('assert');
const constants = require('../utils/constants.js');

const AssetProtocol = artifacts.require('AssetProtocol.sol');
const EtherToken = artifacts.require('EtherToken.sol');
const MelonToken = artifacts.require('MelonToken.sol');
const PriceFeed = artifacts.require('PriceFeed.sol');
const Exchange = artifacts.require('Exchange.sol');
const Universe = artifacts.require('Universe.sol');
const Subscribe = artifacts.require('./Subscribe.sol');
const Redeem = artifacts.require('./Redeem.sol');
const RiskMgmt = artifacts.require('RiskMgmt.sol');
const ManagementFee = artifacts.require('ManagementFee.sol');
const PerformanceFee = artifacts.require('PerformanceFee.sol');
const Core = artifacts.require('Core.sol');


contract('Subscribe', (accounts) => {
  // Test constants
  const INVESTOR = accounts[0];
  const OWNER = accounts[1];
  const PORTFOLIO_NAME = 'Melon Portfolio';
  const PORTFOLIO_SYMBOL = 'MLN-P';
  const PORTFOLIO_DECIMALS = 18;
  const ALLOWANCE_AMOUNT = constants.PREMINED_AMOUNT / 10;

  // Test globals
  let coreContract;
  let etherTokenContract;
  let melonTokenContract;
  let priceFeedContract;
  let exchangeContract;
  let universeContract;
  let subscribeContract;
  let redeemContract;
  let riskmgmtContract;
  let managementFeeContract;
  let performanceFeeContract;
  let exchangeTestCases;
  let riskmgmtTestCases;

  describe('PREPARATIONS', () => {
    before('Check accounts, deploy modules, set testcase', () => {
      EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
      MelonToken.deployed().then((deployed) => { melonTokenContract = deployed; });
      PriceFeed.deployed().then((deployed) => { priceFeedContract = deployed; });
      Exchange.deployed().then((deployed) => { exchangeContract = deployed; });
      Universe.deployed().then((deployed) => { universeContract = deployed; });
      Subscribe.deployed().then((deployed) => { subscribeContract = deployed; });
      Redeem.deployed().then((deployed) => { redeemContract = deployed; });
      RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
      ManagementFee.deployed().then((deployed) => { managementFeeContract = deployed; });
      PerformanceFee.deployed().then((deployed) => { performanceFeeContract = deployed; });
    });

    it('Deploy smart contract', (done) => {
      Core.new(
        OWNER,
        PORTFOLIO_NAME,
        PORTFOLIO_SYMBOL,
        PORTFOLIO_DECIMALS,
        universeContract.address,
        subscribeContract.address,
        redeemContract.address,
        riskmgmtContract.address,
        managementFeeContract.address,
        performanceFeeContract.address,
        { from: OWNER })
          .then((result) => {
            coreContract = result;
            return coreContract.totalSupply();
          })
          .then((result) => {
            assert.equal(result.toNumber(), 0);
            done();
          });
    });

    it('INVESTOR approves SUBSCRIBE to sepnd funds of melonTokenContract', (done) => {
      melonTokenContract.approve(subscribeContract.address, ALLOWANCE_AMOUNT, { from: INVESTOR })
      .then(() => melonTokenContract.allowance(INVESTOR, subscribeContract.address))
      .then((result) => {
        assert.equal(result, ALLOWANCE_AMOUNT);
        done();
      });
    });
  });

  // MAIN TESTING

  describe('SUBSCRIBE TO PORTFOLIO', () => {

  });
});
