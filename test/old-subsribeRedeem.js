const assert = require('assert');
const constants = require('../utils/constants.js');
const functions = require('../utils/functions.js');
const BigNumber = require('bignumber.js');

const EtherToken = artifacts.require('EtherToken.sol');
const MelonToken = artifacts.require('MelonToken.sol');
const BitcoinToken = artifacts.require('BitcoinToken.sol');
const PriceFeed = artifacts.require('PriceFeed.sol');
const Exchange = artifacts.require('Exchange.sol');
const Universe = artifacts.require('Universe.sol');
const Subscribe = artifacts.require('./Subscribe.sol');
const Redeem = artifacts.require('./Redeem.sol');
const RiskMgmt = artifacts.require('RiskMgmt.sol');
const Rewards = artifacts.require('./Rewards.sol');
const Vault = artifacts.require('Vault.sol');

describe.skip('Subscribe and Redeem modules', () => {
  contract('Subscribe', (accounts) => {
    // Test constants
    const OWNER = accounts[0];
    const INVESTOR = accounts[1];
    const MARKETMAKER = accounts[0];
    const PORTFOLIO_NAME = 'Melon Portfolio';
    const PORTFOLIO_SYMBOL = 'MLN-P';
    const PORTFOLIO_DECIMALS = 18;
    const ALLOWANCE_AMOUNT = new BigNumber(1e+27);

    // Test globals
    let vaultContract;
    let etherTokenContract;
    let melonTokenContract;
    let bitcoinTokenContract;
    let priceFeedContract;
    let exchangeContract;
    let universeContract;
    let subscribeContract;
    let redeemContract;
    let riskmgmtContract;
    let rewardsContract;

    // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=MLNETH,ETHXBT,REPETH,ETHEUR
    const data = {
      error: [],
      result: {
        'XETHXXBT':{'a':['0.048000','871','871.000'],'b':['0.047805','38','38.000'],'c':['0.048000','25.00000000'],'v':['114473.71344905','228539.93878035'],'p':['0.044567','0.031312'],'t':[4425,8621],'l':['0.041600','0.038900'],'h':['0.048700','0.048700'],'o':'0.041897'},
        'XETHZEUR':{'a':['43.65000','167','167.000'],'b':['43.51021','1','1.000'],'c':['43.60000','10.00000000'],'v':['138408.66847600','245710.71986448'],'p':['41.96267','40.67496'],'t':[6247,11473],'l':['39.27000','37.42000'],'h':['44.96998','44.96998'],'o':'39.98679'},
        'XMLNXETH':{'a':['0.59890000','36','36.000'],'b':['0.56119000','205','205.000'],'c':['0.56000000','0.00022300'],'v':['1621.65161884','2098.74750661'],'p':['0.60344695','0.61624131'],'t':[175,264],'l':['0.56000000','0.56000000'],'h':['0.65929000','0.67800000'],'o':'0.65884000'},
        'XREPXETH':{'a':['0.202450','70','70.000'],'b':['0.200200','50','50.000'],'c':['0.199840','1.81418400'],'v':['2898.19114399','5080.16762561'],'p':['0.197919','0.208634'],'t':[219,382],'l':['0.182120','0.182120'],'h':['0.215080','0.239990'],'o':'0.214740'}
      }
    };

    const assets = [];
    const pricesRelAsset = functions.krakenPricesRelAsset(data);

    describe('PREPARATIONS', () => {
      before('Check accounts, deploy modules, set testcase', async () => {
        priceFeedContract = await PriceFeed.deployed();
        exchangeContract = await Exchange.deployed();
        universeContract = await Universe.deployed();
        riskmgmtContract = await RiskMgmt.deployed();
        rewardsContract = await Rewards.deployed();
        etherTokenContract = await EtherToken.deployed();
        melonTokenContract = await MelonToken.deployed();
        bitcoinTokenContract = await BitcoinToken.deployed();
      });

      it('Define Price Feed testcase', async () => {
        for (let i = 0; i < await universeContract.numAssignedAssets(); i += 1) {
          assets.push(await universeContract.assetAt(i));
        }
      });

      it('Deploy smart contract', async () => {
        vaultContract = await Vault.new(
          OWNER,
          PORTFOLIO_NAME,
          PORTFOLIO_SYMBOL,
          PORTFOLIO_DECIMALS,
          universeContract.address,
          riskmgmtContract.address,
          rewardsContract.address,
          { from: OWNER },
        );
        assert.equal(await vaultContract.totalSupply(), 0);
      });

      it('Setup Investor', async () => {
        await etherTokenContract.transfer(INVESTOR, ALLOWANCE_AMOUNT, { from: MARKETMAKER });
      });

      it('Setup Market Maker', async () => {
        subscribeContract = await Subscribe.new({ from: MARKETMAKER });
        redeemContract = await Redeem.new({ from: MARKETMAKER });
        // Market Maker builds asset inventory for subscribe contract
        await etherTokenContract.transfer(subscribeContract.address, ALLOWANCE_AMOUNT, { from: MARKETMAKER });
        await melonTokenContract.transfer(subscribeContract.address, ALLOWANCE_AMOUNT, { from: MARKETMAKER });
        await bitcoinTokenContract.transfer(subscribeContract.address, ALLOWANCE_AMOUNT, { from: MARKETMAKER });
      });

      it('Set multiple prices', async () => {
        const txReceipt = await priceFeedContract.updatePrice(assets, pricesRelAsset, { from: OWNER });
        // Check logs
        assert.notEqual(txReceipt.logs.length, 0);
        for (let i = 0; i < txReceipt.logs.length; i += 1) {
          assert.equal(txReceipt.logs[i].event, 'PriceUpdated');
          assert.equal(txReceipt.logs[i].args.ofAsset, assets[i]);
          // TODO test against actual block.time
          assert.notEqual(txReceipt.logs[i].args.atTimestamp.toNumber(), 0);
          assert.equal(txReceipt.logs[i].args.ofPrice, pricesRelAsset[i]);
        }
      });
    });

    // MAIN TESTING
    describe('SUBSCRIBE TO PORTFOLIO', () => {
      it('Creates shares using the reference asset', async () => {
        const wantedShares = new BigNumber(1e+17);
        const offeredValue = new BigNumber(1e+17);
        await etherTokenContract.approve(subscribeContract.address, offeredValue, { from: INVESTOR }); // Approve value to be invested
        await subscribeContract.createSharesWithReferenceAsset(
          vaultContract.address, wantedShares, offeredValue, { from: INVESTOR });
        assert.equal(await vaultContract.balanceOf.call(INVESTOR), wantedShares.toNumber());
      });

      it('Creates shares again after initial share creation', async () => {
        const prevShares = await vaultContract.balanceOf.call(INVESTOR);
        const wantedShares = new BigNumber(2e+17);
        const offeredValue = new BigNumber(2e+17);
        await etherTokenContract.approve(subscribeContract.address, offeredValue, { from: INVESTOR });
        await subscribeContract.createSharesWithReferenceAsset(
          vaultContract.address, wantedShares, offeredValue, { from: INVESTOR },
        );
        assert.equal(await vaultContract.balanceOf.call(INVESTOR), wantedShares.plus(prevShares).toNumber());
      });

      it.skip('Annihilates shares when only ETH invested, and returns assets', async () => {
        const redeemShares = new BigNumber(3e+17);  // all of the shares
        const originalAmt = web3.toWei(10, 'ether');  // all of the token
        await redeemContract.redeemShares(vaultContract.address, redeemShares, { from: INVESTOR });
        assert.equal(await vaultContract.balanceOf(INVESTOR), 0);
        assert.equal(await etherTokenContract.balanceOf.call(INVESTOR), originalAmt);
      });

      it.skip('Creates shares when there are two assets in portfolio', async () => {
        const wantedShares = new BigNumber(2e+17);
        const offeredValue = new BigNumber(2e+17);
        const mlnAmt = 10000;
        const ethAmt = 20000;
        await etherTokenContract.approve(subscribeContract.address, offeredValue, { from: INVESTOR });
        await subscribeContract.createSharesWithReferenceAsset(
          vaultContract.address, wantedShares, offeredValue, { from: INVESTOR },
        );
        assert.equal(await vaultContract.balanceOf.call(INVESTOR), wantedShares);
        // .then(res => assert.equal(res.toNumber(), wantedShares.toNumber()))
        await melonTokenContract.approve(exchangeContract.address, mlnAmt);
        await exchangeContract.make(
          mlnAmt, melonTokenContract.address, ethAmt, etherTokenContract.address, { from: OWNER },
        );
        await melonTokenContract.transfer(subscribeContract.address, mlnAmt, { from: OWNER });
        assert(await vaultContract.takeOrder(exchangeContract.address, 1, mlnAmt));
        assert.equal(await melonTokenContract.balanceOf.call(vaultContract.address), mlnAmt);
        const refPrice = await vaultContract.getRefPriceForNumShares.call(wantedShares);
        await etherTokenContract.approve(subscribeContract.address, refPrice, { from: INVESTOR });
        await subscribeContract.createSharesWithReferenceAsset(
           vaultContract.address, wantedShares, refPrice, { from: INVESTOR },
        );
        assert.equal(await vaultContract.balanceOf.call(INVESTOR), 2 * wantedShares);
      });

      it.skip('Redeems shares for ref asset when two assets in portfolio', async () => {
        const ethAmt = new BigNumber(1e+18);  // eth to start redeem contract with
        await etherTokenContract.transfer(redeemContract.address, ethAmt, { from: OWNER });
        const redeemShares = await vaultContract.balanceOf.call(INVESTOR);
        const initialBal = await etherTokenContract.balanceOf.call(INVESTOR);
        const investorShareVal = await vaultContract.getRefPriceForNumShares.call(redeemShares);
        await vaultContract.approve(redeemContract.address, redeemShares, { from: INVESTOR });
        await redeemContract.redeemSharesForReferenceAsset(vaultContract.address, redeemShares, { from: INVESTOR });
        assert.equal(await vaultContract.balanceOf.call(INVESTOR), 0); // no shares left
        assert.eqaul(await etherTokenContract.balanceOf.call(INVESTOR), investorShareVal.plus(initialBal)); // refAsset returned
      });
    });
  });
});
