
import test from "ava";
import Api from '@parity/api';
const BigNumber = require("bignumber.js");

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let opts;

const mockOne = "0x1111111111111111111111111111111111111111";
const mockTwo = "0x2222222222222222222222222222222222222222";
const mockThree = "0x3333333333333333333333333333333333333333";
const mockFour =  "0x4444444444444444444444444444444444444444";

const EMPTY = '0x0000000000000000000000000000000000000000';

var assetArray = [mockOne, mockTwo, mockThree];

var DUMMY_ADDR = [EMPTY, EMPTY, mockOne, mockFour];
const DUMMY_VALS = [0, 0, 0];

async function createAssetBlacklist(_assetArray) {
    return deployContract('risk-management/AssetBlacklist', opts, [_assetArray]);
}

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

let testAssetBlacklist = Api.util.sha3('testAssetBlacklist(address[5],uint256[3])').substring(0, 10);

test('Creating Asset Blacklist...', async t => {
    //deploy assetBlacklist policy contract with assetArray
    let assetBlacklist = await createAssetBlacklist(assetArray);

    t.deepEqual(await assetBlacklist.methods.getMembers().call(), assetArray);

});

test('Add Asset to Blacklist...', async t => {
    //deploy assetBlacklist policy contract
    let assetBlacklist = await createAssetBlacklist(assetArray);

    //check blacklist against assets banned
    t.deepEqual(await assetBlacklist.methods.getMembers().call(), [mockOne, mockTwo, mockThree]);

    //Try adding duplicate; expect it to throw
    await t.throws(assetBlacklist.methods.addToBlacklist(mockTwo).send());
    //should still equal same initial array of assets
    t.deepEqual(await assetBlacklist.methods.getMembers().call(), assetArray);

    //adding banned asset
    await t.notThrows( assetBlacklist.methods.addToBlacklist(mockFour).send());
    //checking if it is there
    t.true(await assetBlacklist.methods.isMember(mockFour).call());

});

test('Test trading against blacklist...', async t => {
    //deploy assetBlacklist policy contract
    let assetBlacklist = await createAssetBlacklist(assetArray);

    let mockFund = await deployContract('policies/mocks/MockFund', opts);
    await mockFund.methods.register(testAssetBlacklist, assetBlacklist.options.address).send();

    //mockFour is the token being aquired by the portfolio in the trade (taker asset, position 4)
    //mockFour is not registerd in the blacklist, therefore we expect the following to not throw
    await t.notThrows(mockFund.methods.testAssetBlacklist(DUMMY_ADDR, DUMMY_VALS).send())

    //adding banned asset
    await t.notThrows( assetBlacklist.methods.addToBlacklist(mockFour).send());

    //checking if it is there
    t.true(await assetBlacklist.methods.isMember(mockFour).call());

    //Now try to trade acquiring mockFour, which was just banned
    //mockFour IS  registerd in the blacklist, therefore we expect the following to throw
    await t.throws(mockFund.methods.testAssetBlacklist(DUMMY_ADDR, DUMMY_VALS).send())

});
