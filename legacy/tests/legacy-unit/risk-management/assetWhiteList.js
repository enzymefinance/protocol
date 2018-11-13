
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

var DUMMY_ADDR = [EMPTY, EMPTY, mockOne, mockTwo];
const DUMMY_VALS = [0, 0, 0];

async function createAssetWhitelist(_assetArray) {
    return deployContract('risk-management/AssetWhitelist', opts, [_assetArray]);
}

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

let testAssetWhitelist = Api.util.sha3('testAssetWhitelist(address[5],uint256[3])').substring(0, 10);

test('Creating Asset Whitelist...', async t => {
    //deploy assetWhitelist policy contract with assetArray
    let assetWhitelist = await createAssetWhitelist(assetArray);

    t.deepEqual(await assetWhitelist.methods.getMembers().call(), assetArray);

});

test('Remove Asset from Whitelist...', async t => {
    //deploy assetWhitelist policy contract
    let assetWhitelist = await createAssetWhitelist(assetArray);

    //check whitelist against assets allowed
    t.deepEqual(await assetWhitelist.methods.getMembers().call(), [mockOne, mockTwo, mockThree]);

    //Try removing non-member asset; expect it to throw
    await t.throws(assetWhitelist.methods.removeFromWhitelist(mockFour).send());
    //should still equal same initial array of assets
    t.deepEqual(await assetWhitelist.methods.getMembers().call(), assetArray);

    //removing a previously allowed asset
    await t.notThrows(assetWhitelist.methods.removeFromWhitelist(mockThree).send());
    //ensuring it is no longer there
    t.false(await assetWhitelist.methods.isMember(mockThree).call());

});

test('Test trading against whitelist...', async t => {
    //deploy assetWhitelist policy contract
    let assetWhitelist = await createAssetWhitelist(assetArray);

    t.deepEqual(await assetWhitelist.methods.getMembers().call(), assetArray);
    t.is(Number(await assetWhitelist.methods.getMemberCount().call()), assetArray.length);
    t.true(await assetWhitelist.methods.isMember(mockTwo).call());

    let mockFund = await deployContract('policies/mocks/MockFund', opts);
    await mockFund.methods.register(testAssetWhitelist, assetWhitelist.options.address).send();

    //mockTwo is the token being aquired by the portfolio in the trade (taker asset, position 4)
    //mockTwo is  registerd in the list, therefore we expect the following to not throw
    await t.notThrows(mockFund.methods.testAssetWhitelist(DUMMY_ADDR, DUMMY_VALS).send())

    //remove asset from whitelist
    await t.notThrows(assetWhitelist.methods.removeFromWhitelist(mockTwo).send());
    t.deepEqual(await assetWhitelist.methods.getMembers().call(), [mockOne, mockThree]);
    t.is(Number(await assetWhitelist.methods.getMemberCount().call()), assetArray.length-1);
    t.false(await assetWhitelist.methods.isMember(mockTwo).call());

    //ensuring mockTwo is no longer a member
    t.false(await assetWhitelist.methods.isMember(mockTwo).call());

    //Now try to trade acquiring mockTwo, which was just removed
    //mockTwo IS NOT  registerd in the whitelist, therefore we expect the following to throw
    await t.throws(mockFund.methods.testAssetWhitelist(DUMMY_ADDR, DUMMY_VALS).send());

    //not aquire mockThree which is still on the whitelist; expect success
    DUMMY_ADDR = [EMPTY, EMPTY, mockOne, mockThree];
    await t.notThrows(mockFund.methods.testAssetWhitelist(DUMMY_ADDR, DUMMY_VALS).send());

});
