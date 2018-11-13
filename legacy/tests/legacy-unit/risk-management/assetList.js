
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

var assetArray = [mockOne, mockTwo, mockThree];

var assetArrayDup = [mockOne, mockTwo, mockTwo, mockThree];

async function createAssetList(_assetArray) {
    return deployContract('risk-management/AssetList', opts, [_assetArray]);
}

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

test('Testing List Creation...', async t => {

    let list = await createAssetList(assetArray);

    t.deepEqual(await list.methods.getMembers().call(), [mockOne, mockTwo, mockThree]);

})

test('Testing List Creation with duplicate entry...', async t => {

    let list = await createAssetList(assetArrayDup);

    t.deepEqual(await list.methods.getMembers().call(), assetArray);
    t.notDeepEqual(await list.methods.getMembers().call(), assetArrayDup);
    t.is(Number(await list.methods.getMemberCount().call()), assetArray.length);

})

test('Testing isMember()...', async t => {

    let list = await createAssetList(assetArray);

    //mockOne is member, should return true
    t.true(await list.methods.isMember(mockOne).call());
    //mockFour is not a member, should return false
    t.false(await list.methods.isMember(mockFour).call());

})

test('Testing getMemberCount()...', async t => {

    let list = await createAssetList(assetArray);

    //should return same number of members as the len of initial asset array
    t.is(Number(await list.methods.getMemberCount().call()), assetArray.length);

})

test('Testing getMembers()...', async t => {

    let list = await createAssetList(assetArray);

    //should be not equal to these ad hoc arrays
    t.notDeepEqual(await list.methods.getMembers().call(), [mockOne, mockTwo, mockThree, mockFour])
    t.notDeepEqual(await list.methods.getMembers().call(), [mockOne, mockTwo, mockFour])

    //should be equal to the initialization asset array
    t.deepEqual(await list.methods.getMembers().call(), assetArray);

})
