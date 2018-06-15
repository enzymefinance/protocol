import test from "ava";
import Api from '@parity/api';

import api from "../../../utils/lib/api";
import { deployContract } from "../../../utils/lib/contracts";

let testPolicy = Api.util.sha3("testPolicy(address[4],uint256[2])").substring(0, 10);

const EMPTY = '0x0000000000000000000000000000000000000000';

const DUMMY_ADDR = [EMPTY, EMPTY, EMPTY, EMPTY];
const DUMMY_VALS = [0, 0];

async function isReverted(txHash) {
    return (await api.eth.getTransactionReceipt(txHash)).gasUsed == 1600000;
}

async function createFund() {
    const accounts = await api.eth.accounts();

    let opts = {
        from: accounts[0]
    };

    let fund = await deployContract('policies/mocks/MockFund', opts);
    return fund;
}

test('PriceFeed', async t => {
    let pricefeed = await deployContract('policies/mocks/MockPriceFeed', {});

    const mockOne = "0x1110E6384FEa0791e18151c531fe70da23c55fa2";
    const mockTwo = "0x222b2A235627Ac97EAbc6452F98Ce296a1EF3984";

    const txHash = await pricefeed.instance.update.postTransaction({}, [[mockOne, mockTwo], [2, 3]]);

    t.is(await isReverted(txHash), false);
    t.is((await pricefeed.instance.getPrice.call({}, [mockOne]))[0].toNumber(), 2)
    t.is((await pricefeed.instance.getPrice.call({}, [mockTwo]))[0].toNumber(), 3)
})

test("True policy", async t => {
    const accounts = await api.eth.accounts();

    let opts = {
        from: accounts[0]
    };

    let fund = await deployContract('policies/mocks/MockFund', opts);
    let truePolicy = await deployContract('policies/TruePolicy', opts);

    await fund.instance.register.postTransaction({}, [
        testPolicy,
        truePolicy.address
    ]);

    const txHash = await fund.instance.testPolicy.postTransaction({}, [DUMMY_ADDR, DUMMY_VALS]);
    t.is(await isReverted(txHash), false);
})

test("False policy", async t => {
    const accounts = await api.eth.accounts();

    let opts = {
        from: accounts[0]
    };

    let fund = await deployContract('policies/mocks/MockFund', opts);
    let falsePolicy = await deployContract('policies/FalsePolicy', opts);

    await fund.instance.register.postTransaction({}, [
        testPolicy,
        falsePolicy.address
    ]);

    const txHash = await fund.instance.testPolicy.postTransaction({}, [DUMMY_ADDR, DUMMY_VALS]);
    t.is(await isReverted(txHash), true);
})
