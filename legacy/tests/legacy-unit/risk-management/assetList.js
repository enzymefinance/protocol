
import test from "ava";
import Api from '@parity/api';
const BigNumber = require("bignumber.js");

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let opts;

const mockOne = "0x1111111111111111111111111111111111111111";
const mockTwo = "0x2222222222222222222222222222222222222222"; 
const mockThree = "0x3333333333333333333333333333333333333333"; 

async function createAssetList(maxItems=10) {
    return deployContract('risk-management/AssetList', opts, [maxItems]);
}

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

test('Insert', async t => {

    let list = await createAssetList(2);
    await t.notThrows(list.methods.register(mockOne).send());
    t.deepEqual(await list.methods.getList().call(), [mockOne])

    t.true(await list.methods.exists(mockOne).call())
    t.false(await list.methods.exists(mockTwo).call())

    // Fails to register again mockOne
    await t.throws(list.methods.register(mockOne).send());

    await t.notThrows(list.methods.register(mockTwo).send());
    t.deepEqual(await list.methods.getList().call(), [mockOne, mockTwo]);

    // Fails to register more than 3 assets
    await t.throws(list.methods.register(mockThree).send());
})

test('Freeze', async t => {
    let list = await createAssetList(2);
    await t.notThrows(list.methods.register(mockOne).send());

    await list.methods.freeze().send();
    await t.throws(list.methods.register(mockTwo).send());
})
