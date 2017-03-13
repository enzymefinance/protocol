const async = require('async');
const assert = require('assert');
const BigNumber = require('bignumber.js');
const constants = require('../utils/constants.js');
const functions = require('../utils/functions.js');

const EtherToken = artifacts.require("./EtherToken.sol");
const BitcoinToken = artifacts.require("./BitcoinToken.sol");
const RepToken = artifacts.require("./RepToken.sol");
const EuroToken = artifacts.require("./EuroToken.sol");
const PriceFeed = artifacts.require("PriceFeed.sol");
const Exchange = artifacts.require("Exchange.sol");
const Universe = artifacts.require("Universe.sol");
const RiskMgmt = artifacts.require("RiskMgmt.sol");
const Core = artifacts.require("Core.sol");

contract('Net Asset Value', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const ADDRESS_PLACEHOLDER = '0x0';
  const NUM_OFFERS = 1;
  const ALLOWANCE_AMOUNT = constants.PREMINED_AMOUNT / 10;
  // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
  const data = {
    'error':[],
    'result': {
      'XETHXXBT': {'a':['0.011558','135','135.000'],'b':['0.011550','376','376.000'],'c':['0.011550','0.47405000'],'v':['100153.86921002','112421.66650936'],'p':['0.011477','0.010527'],'t':[1980,2248],'l':['0.011318','0.011318'],'h':['0.011651','0.011710'],'o':'0.011521'},
      'XETHZEUR': {'a':['9.83249','23','23.000'],'b':['9.79000','72','72.000'],'c':['9.80510','16.54860000'],'v':['33417.76252715','39085.89051588'],'p':['9.72591','9.70190'],'t':[1384,1601],'l':['9.53300','9.51171'],'h':['9.84900','9.84900'],'o':'9.68796'},
      'XREPXETH': {'a':['0.435820','1','1.000'],'b':['0.430570','80','80.000'],'c':['0.435790','1.71736386'],'v':['483.41580154','569.06380459'],'p':['0.428581','0.429142'],'t':[36,48],'l':['0.421730','0.421730'],'h':['0.437000','0.437000'],'o':'0.423270'},
    }
  };
  // Prices Relative to Asset
  const eth_ett = 1.0; // By definition
  const eth_xbt = functions.invertAssetPairPrice(data.result.XETHXXBT.c[0]);
  const eth_rep = functions.invertAssetPairPrice(data.result.XREPXETH.c[0]);
  const eth_eur = functions.invertAssetPairPrice(data.result.XETHZEUR.c[0]);
  // Atomize Prices realtive to Asset
  const pricesRelAsset = [
    functions.atomizeAssetPrice(eth_ett, constants.ETHERTOKEN_DECIMALS),
    functions.atomizeAssetPrice(eth_xbt, constants.BITCOINTOKEN_DECIMALS),
    functions.atomizeAssetPrice(eth_rep, constants.REPTOKEN_DECIMALS),
    functions.atomizeAssetPrice(eth_eur, constants.EUROTOKEN_DECIMALS),
  ];
  // Prices Relative to Ether
  const ett_eth = 1.0; // By definition
  const xbt_eth = data.result.XETHXXBT.c[0]; // Price already relavtive to ether
  const rep_eth = data.result.XREPXETH.c[0]; // Price already relavtive to ether
  const eur_eth = data.result.XETHZEUR.c[0]; // Price already relavtive to ether
  // Atomize Prices realtive to Ether
  const pricesRelEther = [
    functions.atomizeAssetPrice(ett_eth, constants.ETHERTOKEN_DECIMALS),
    functions.atomizeAssetPrice(xbt_eth, constants.BITCOINTOKEN_DECIMALS),
    functions.atomizeAssetPrice(rep_eth, constants.REPTOKEN_DECIMALS),
    functions.atomizeAssetPrice(eur_eth, constants.EUROTOKEN_DECIMALS),
  ];

  // Test globals
  let coreContract;
  let etherTokenContract;
  let bitcoinTokenContract;
  let dollarTokenContract;
  let euroTokenContract;
  let assetList;
  let priceFeedContract;
  let exchangeContract;
  let registrarContract;
  let riskmgmtContract;
  let priceFeedTestCases;
  let exchangeTestCases;
  let riskmgmtTestCases;
  let lastOfferId = 0;

  before('Check accounts, deploy modules, set testcase', (done) => {
    assert.equal(accounts.length, 10);

    // Setup Asset
    assetList = [];
    priceFeedTestCases = [];
    EtherToken.new({ from: OWNER })
      .then((result) => {
        etherTokenContract = result;
        assetList.push(result.address)
        return BitcoinToken.new({ from: OWNER });
      })
      .then((result) => {
        bitcoinTokenContract = result;
        assetList.push(result.address)
        return RepToken.new({ from: OWNER });
      })
      .then((result) => {
        dollarTokenContract = result;
        assetList.push(result.address)
        return EuroToken.new({ from: OWNER });
      })
      .then((result) => {
        euroTokenContract = result;
        assetList.push(result.address)
        return PriceFeed.new({ from: OWNER });
      })
      .then((result) => {
        priceFeedContract = result;
        for (let i = 0; i < pricesRelEther.length; i += 1) {
          priceFeedTestCases.push(
            {
              address: assetList[i],
              price: pricesRelEther[i],
            }
          );
        }
        return Exchange.new({ from: OWNER });
      })
      .then((result) => {
        exchangeContract = result;
        return Universe.new(
          [
            assetList[0],
            assetList[1],
            assetList[2],
            assetList[3],
          ], [
            priceFeedContract.address,
            priceFeedContract.address,
            priceFeedContract.address,
            priceFeedContract.address,
          ], [
            exchangeContract.address,
            exchangeContract.address,
            exchangeContract.address,
            exchangeContract.address,
          ], { from: OWNER });
      })
      .then((result) => {
        registrarContract = result;
        return RiskMgmt.new(exchangeContract.address, { from: OWNER });
      })
      .then((result) => {
        riskmgmtContract = result;
        done();
      });
  });

  it('Deploy smart contract', (done) => {
    Core.new(OWNER,
      registrarContract.address,
      riskmgmtContract.address,
      ADDRESS_PLACEHOLDER,
      ADDRESS_PLACEHOLDER,
      { from: OWNER })
        .then((result) => {
          coreContract = result;
          return coreContract.sumInvested();
        })
        .then((result) => {
          assert.equal(result.toNumber(), 0);
          done();
        });
  });

  it('Set multiple price', (done) => {
    // Price of EtherToken is constant for all times
    const addresses = [
      priceFeedTestCases[0].address,
      priceFeedTestCases[1].address,
      priceFeedTestCases[2].address,
      priceFeedTestCases[3].address,
    ];
    const inverseAtomizedPrices = [
      priceFeedTestCases[0].price,
      priceFeedTestCases[1].price,
      priceFeedTestCases[2].price,
      priceFeedTestCases[3].price,
    ];
    priceFeedContract.updatePrice(addresses, inverseAtomizedPrices, { from: OWNER })
      .then(() => priceFeedContract.getUpdateCounter())
      .then((result) => {
        assert.notEqual(result.toNumber(), 0);
        done();
      });
  });

  it('Get multiple existent prices', (done) => {
    async.mapSeries(
      priceFeedTestCases,
      (testCase, callbackMap) => {
        priceFeedContract.getPrice(testCase.address, { from: NOT_OWNER })
          .then((result) => {
            console.log(`Price: ${result}, \t TestCase: ${testCase.price}`);
            assert.equal(result.toNumber(), testCase.price);
            callbackMap(null, testCase);
          });
      },
      (err, results) => {
        priceFeedTestCases = results;
        done();
      });
  });

  it('Set up test cases', (done) => {
    exchangeTestCases = [];
    for (let i = 0; i < NUM_OFFERS; i += 1) {
      exchangeTestCases.push(
        {
          sell_how_much: Math.floor(pricesRelAsset[1] * (1 - (i * 0.1))),
          sell_which_token: bitcoinTokenContract.address,
          buy_how_much: 1 * constants.ether,
          buy_which_token: etherTokenContract.address,
          id: i + 1,
          owner: OWNER,
          active: true,
        }
      );
    }
    // riskmgmtTestCases = [];
    // for (let i = 0; i < NUM_OFFERS; i += 1) {
    //   riskmgmtTestCases.push(
    //     {
    //       sell_how_much: Math.floor(pricesRelAsset[1] * (1 - (i * 0.1))),
    //       sell_which_token: bitcoinTokenContract.address,
    //       buy_how_much: 1 * constants.ether,
    //       buy_which_token: etherTokenContract.address,
    //       id: i + 1,
    //       owner: OWNER,
    //       active: true,
    //     },
    //   );
    // }
    done();
  });

  it('OWNER approves exchange to hold funds of bitcoinTokenContract', (done) => {
    bitcoinTokenContract.approve(exchangeContract.address, ALLOWANCE_AMOUNT, { from: OWNER })
      .then(() => bitcoinTokenContract.allowance(OWNER, exchangeContract.address))
      .then((result) => {
        assert.equal(result, ALLOWANCE_AMOUNT);
        done();
      });
  });

  it('Create one side of the orderbook', (done) => {
    // exchangeContract.offer(
    //   1000,
    //   testCase.sell_which_token,
    //   testCase.buy_how_much,
    //   testCase.buy_which_token,
    //   { from: OWNER }
    // )
    // .then((result) => {
    //   done();
    // });

    // async.mapSeries(
    //   exchangeTestCases,
    //   (testCase, callbackMap) => {
    //     console.log(OWNER)
    //     exchangeContract.offer(
    //       testCase.sell_how_much,
    //       testCase.sell_which_token,
    //       testCase.buy_how_much,
    //       testCase.buy_which_token,
    //       { from: OWNER }
    //     ).then((txHash) => {
    //       const result = Object.assign({ txHash }, testCase);
    //       callbackMap(null, result);
    //     });
    //   },
    //   (err, results) => {
    //     exchangeTestCases = results;
    //     done();
    //   }
    // );
  });

  it('Check if orders created', (done) => {
    exchangeContract.lastOfferId({ from: OWNER })
    .then((result) => {
      lastOfferId = result.toNumber();
      assert.equal(lastOfferId, NUM_OFFERS);
      done();
    });
  });

  it('Check orders information', (done) => {
    async.mapSeries(
      exchangeTestCases,
      (testCase, callbackMap) => {
        exchangeContract.offers(testCase.id)
        .then(() => {
          callbackMap(null, testCase);
        });
      },
      (err, results) => {
        exchangeTestCases = results;
        done();
      }
    );
  });

  // MAIN TESTING

  it('Create and Annihilate Shares by investing and withdrawing in a Core and ' +
      'calculate performance', (done) => {
    /* Investing and redeeming:
     *  Round 1 & 4: Exact
     *  Rount 2 & 5: Overpaid
     *  Round 3 & 6: Underpaid
     */
    const wantedShares = [new BigNumber(2e+18), new BigNumber(3e+18), new BigNumber(7e+18)];
    const investFunds = [new BigNumber(2e+18), new BigNumber(5e+18), new BigNumber(6e+18)];
    const correctPriceToBePaid = [new BigNumber(2e+18), new BigNumber(3e+18), new BigNumber(7e+18)];
    // const withdrawFunds = [2*999999999999977800, new BigNumber(1e+18), new BigNumber(7e+18)];
    const offeredShares = [new BigNumber(2e+18), new BigNumber(5e+18), new BigNumber(6e+18)];
    const redeemFunds = [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];
    // const correctPriceToBeReceived = [new BigNumber(2e+18), new BigNumber(3e+18), new BigNumber(7e+18)];


    // const correctPriceToBeReceived =
    //     [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];

    /* Managing
     *  Round 1:
     */
    const buy = [
      {
        exchange: exchangeContract.address,
        buy_how_much: Math.floor(pricesRelAsset[1]),
        id: 1,
      }
    ];

    coreContract.totalSupply()
    .then((result) => {
      assert.strictEqual(result.toNumber(), 0);

      // ROUND 1 EXACT
      return coreContract.createShares(wantedShares[0],
        { from: NOT_OWNER, value: investFunds[0].toNumber() });
    })
    // Check totalSupply and sumInvested
    .then(() => coreContract.totalSupply())
    .then((result) => {
      assert.strictEqual(result.toNumber(), wantedShares[0].toNumber());
    })
    .then(() => coreContract.sumInvested())
    .then((result) => {
      assert.strictEqual(result.toNumber(), correctPriceToBePaid[0].toNumber());

      // ROUND 2 0VERPAID
      return coreContract.createShares(wantedShares[1],
          { from: NOT_OWNER, value: investFunds[1].toNumber() });
    })
    // Check totalSupply and sumInvested
    .then(() => coreContract.totalSupply())
    .then((result) => {
      assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
    })
    .then(() => coreContract.sumInvested())
    .then((result) => {
      assert.strictEqual(result.toNumber(),
        correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());

      // ROUND 3 UNDERPAID
      return coreContract.createShares(wantedShares[2],
        { from: NOT_OWNER, value: investFunds[2].toNumber() });
    })
    // Check totalSupply and sumInvested
    .then(() => coreContract.totalSupply())
    .then((result) => {
      // Paid to little, hence no shares received
      assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
    })
    .then(() => coreContract.sumInvested())
    .then((result) => {
      // Paid to little, hence no investment made
      assert.strictEqual(result.toNumber(),
          correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
      return coreContract.balanceOf(NOT_OWNER);
    })
    .then((result) => {
      const balance = wantedShares[0].add(wantedShares[1]).toNumber();
      assert.strictEqual(result.toNumber(), balance);

      // ROUND 3 MANAGING
      return coreContract.buy(buy[0].exchange, buy[0].id, buy[0].buy_how_much, { from: OWNER });
    })
    .then(() => etherTokenContract.balanceOf(coreContract.address))
    .then((result) => {
      console.log(`EtherToken held: \t\t${result.toString()}`);
      return bitcoinTokenContract.balanceOf(coreContract.address);
    })
    .then((result) => {
      console.log(`BitcoinToken held: \t\t${result.toString()}`);
      return coreContract.calcSharePrice();
    })
    .then((result) => {
      console.log(`New share price is: \t\t${result.toString()}`);
      //TODO Calculate more precise
      const roundingError = 0.01;
      console.log(`Round 4; Sell shares: \t\t${offeredShares[0]}`);
      console.log(`Round 4; Funds to redeem: \t${redeemFunds[0] * result.toString() / constants.ether * (1.0 - roundingError)}`);

      // ROUND 4 EXACT
      return coreContract.annihilateShares(offeredShares[0], redeemFunds[0] * result.toString() / constants.ether * (1.0 - roundingError), { from: NOT_OWNER });
    })
    .then(() => coreContract.totalSupply())
    .then((result) => {
      const balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
      assert.strictEqual(result.toNumber(), balance);
    })
    .then(() => coreContract.sumWithdrawn())
    .then((result) => {
      // TODO: calculate outside w commission etc.
      console.log(`Round 4; Funds received: \t${result.toNumber()}`);
      // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].toNumber());
    })
    .then(() => coreContract.balanceOf(NOT_OWNER))
    .then((result) => {
      const balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
      assert.strictEqual(result.toNumber(), balance);
    })
    // // ROUND 5 OVERPAID
    // .then(() => coreContract.annihilateShares(offeredShares[1], 10000, { from: NOT_OWNER }))
    // .then(() => coreContract.totalSupply())
    // .then((result) => {
    //   const balance = wantedShares[0]
    //     .add(wantedShares[1]).minus(offeredShares[0]).minus(offeredShares[1]).toNumber();
    //   assert.strictEqual(result.toNumber(), balance);
    // })
    // // Check sumInvested
    // .then(() => coreContract.sumWithdrawn())
    // .then(() => {
    //   // TODO: calculate outside w commission etc.
    //   // console.log('Sold shares: ' + offeredShares[1]);
    //   // console.log('Funds received (total): ' + result.toNumber());
    //   // assert.strictEqual(result.toNumber(),
    //   //     correctPriceToBeReceived[0].add(correctPriceToBeReceived[1]).toNumber());
    // })
    // .then(() => {
    //   // TODO: calculate outside w commission, performance gains, loses etc.
    //   // for (i = 0; i < numAccounts; ++i) {
    //   //   // Actual Balance
    //   //   var balance = web3.eth.getBalance(web3.eth.accounts[i],'ether');
    //   //   // >=, since actual balance has a gas cost for sending the tx.
    //   //   // TODO: Estimate Gas cost
    //   //   console.log(' Gas cost of Account ' + i + ':',
    //   //       balances[i].minus(balance).dividedBy('10e+18').toNumber());
    //   //   assert.isTrue(balances[i].greaterThanOrEqualTo(balance),
    //   //       "One of the Accounts has wrong balance!")
    //   // };
    // })
    .then(done)
    .catch(done);
  });
});
