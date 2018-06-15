import test from "ava";
import Api from '@parity/api';
const BigNumber = require("bignumber.js");

import api from "../../../utils/lib/api";
import { deployContract } from "../../../utils/lib/contracts";

let testPolicy = Api.util.sha3("testPolicy(address[4],uint256[2])").substring(0, 10);

const EMPTY = '0x0000000000000000000000000000000000000000';

const mockOne = "0x1110E6384FEa0791e18151c531fe70da23c55fa2";
const mockTwo = "0x222b2A235627Ac97EAbc6452F98Ce296a1EF3984";

async function isReverted(txHash) {
    return (await api.eth.getTransactionReceipt(txHash)).gasUsed == 1600000;
}

function to18(number) {
    return (new BigNumber(number)).times(10 ** 18)
}

test.beforeEach(async t => {
    t.context.pricefeed = await deployContract('policies/mocks/MockPriceFeed', {});
    t.context.fund = await deployContract('policies/mocks/MockFund', {});

    const txHash = await t.context.fund.instance.setPriceFeed.postTransaction({}, [t.context.pricefeed.address]);
    t.is(await isReverted(txHash), false);
})

test('Create', async t => {

    // 10 % tolerance
    let priceTolerance = await deployContract('risk-management/PriceTolerance', {}, [10]);
    t.is((await priceTolerance.instance.tolerance.call({})).toNumber(), 100000000000000000)

    // register the policy
    let txHash = await t.context.fund.instance.register.postTransaction({}, [
        testPolicy,
        priceTolerance.address
    ]);
    t.is(await isReverted(txHash), false);

    // Pricefeed update
    txHash = await t.context.pricefeed.instance.update.postTransaction({}, [[mockOne, mockTwo], [to18(100), to18(150)]]);
    t.is(await isReverted(txHash), false);

    // Price tolerance
    const tests = [
        {
            tokens: [mockOne, mockTwo],
            values: [100, 150],
            reverted: false,
        }
    ]

    for (const test of tests) {
        const {tokens, values, reverted} = test;
        
        txHash = await t.context.fund.instance.testPolicy.postTransaction({}, [[EMPTY, EMPTY, ...tokens], values]);
        t.is(await isReverted(txHash), reverted);
    }
});
