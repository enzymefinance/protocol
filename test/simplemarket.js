var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');


contract('SimpleMarket', (accounts) => {

  // CONSTANTS
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const NUM_OFFERS = 8;


  // GLOBALS
  let contract;
  let contractAddress;
  let etherTokenContract;
  let etherTokenAddress;
  let premineTokenContract;
  let premineTokenAddress;
  let testCases;
  const ETHER = new BigNumber(Math.pow(10,18));
  let lastOfferId = 0;


  before('Check accounts', (done) => {
    assert.equal(accounts.length, 10);
    done();
  });

  it('Deploy smart contract', (done) => {
    SimpleMarket.new().then((result) => {
      contract = result;
      contractAddress = contract.address;
      return contract.lastOfferId();
    }).then((result) => {
      assert.equal(result.toNumber(), INITIAL_OFFER_ID)
      return EtherToken.new();
    }).then((result) => {
      etherTokenContract = result;
      etherTokenAddress = etherTokenContract.address;
      return PremineToken.new({ from: OWNER });
    }).then((result) => {
      premineTokenContract = result;
      premineTokenAddress = premineTokenContract.address;
      done();
    });
  });

  it('Set up test cases', (done) => {
    testCases = [];
    for (i = 0; i < NUM_OFFERS; i++) {
      testCases.push(
        {
          sell_how_much: i + 1,
          sell_which_token: premineTokenAddress,
          buy_how_much: 2*i + 1,
          buy_which_token: etherTokenAddress,
          id: 0,
        }
      );
    }
    done();
  });

  it('Create one side of the orderbook', (done) => {
    //TODO asyncMap
    for (i = 0; i < NUM_OFFERS; i++) {
      lastOfferId += 1;
      console.log(testCases[i].sell_how_much + "\t" +
        testCases[i].sell_which_token + "\n" +
        testCases[i].buy_how_much  + "\t" +
        testCases[i].buy_which_token + "\n");
      // contract.offer(
      //   testCases[i].sell_how_much,
      //   testCases[i].sell_which_token,
      //   testCases[i].buy_how_much,
      //   testCases[i].buy_which_token,
      //   { from: OWNER }
      // ).then((result) => {
      //   // testCases[i].id = result;
      //   console.log('Result: ', result);
      //   if (lastOfferId == NUM_OFFERS) done();
      // });
    }
    done();
  });

});
