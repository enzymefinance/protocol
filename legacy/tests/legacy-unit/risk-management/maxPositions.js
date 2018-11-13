
import test from "ava";
import Api from '@parity/api';
const BigNumber = require("bignumber.js");

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let opts;

const mockOne = "0x1111111111111111111111111111111111111111";
const mockTwo = "0x2222222222222222222222222222222222222222";
const mockThree = "0x3333333333333333333333333333333333333333";

const EMPTY = '0x0000000000000000000000000000000000000000';

const DUMMY_ADDR = [EMPTY, EMPTY, EMPTY, EMPTY];
const DUMMY_VALS = [0, 0, 0];

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

let testMaxPositions = Api.util.sha3('testMaxPositions(address[5],uint256[3],uint256)').substring(0, 10);

test('Testing maxPositions policy creation; 0 max positions...', async t => {

    var maxPos = 0;
    await t.notThrows(deployContract('risk-management/MaxPositions', opts, [maxPos]));

});

test('Testing maxPositions policy creation; 125 max positions...', async t => {

    var maxPos = 125;
    await t.notThrows(deployContract('risk-management/MaxPositions', opts, [maxPos]));

});

test('Testing getMaxPositions()...', async t => {

    var maxPos = 10;
    const maxPositions = await deployContract('risk-management/MaxPositions', opts, [maxPos])
    t.is(Number(await maxPositions.methods.getMaxPositions().call()), maxPos);

});

test('Testing Trading Max positions...', async t => {

    var maxPos = 2;
    var fundPos = 2;
    const maxPositions = await deployContract('risk-management/MaxPositions', opts, [maxPos])

    let mockFund = await deployContract('policies/mocks/MockFund', opts);

    // Set a mock pricefeed
    let mockPriceFeed = await deployContract('policies/mocks/MockPriceFeed', opts);
    await mockPriceFeed.methods.setQuoteAsset(mockTwo).send();
    await mockFund.methods.setPriceFeed(mockPriceFeed.options.address).send();


    await mockFund.methods.register(testMaxPositions, maxPositions.options.address).send();

    //Expect success as 2 assets in fund; only two allowed
    await t.notThrows(mockFund.methods.testMaxPositions(DUMMY_ADDR, DUMMY_VALS, fundPos).send())
    fundPos = 3;
    //Expect failure as 3 assets in fund; only two allowed
    await t.throws(mockFund.methods.testMaxPositions(DUMMY_ADDR, DUMMY_VALS, fundPos).send())
});
