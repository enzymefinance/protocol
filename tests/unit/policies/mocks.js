import test from "ava";
import Api from '@parity/api';

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let testPolicy = Api.util.sha3("testPolicy(address[4],uint256[2])").substring(0, 10);

const EMPTY = '0x0000000000000000000000000000000000000000';

const DUMMY_ADDR = [EMPTY, EMPTY, EMPTY, EMPTY];
const DUMMY_VALS = [0, 0];

let opts;

let truePolicy;
let falsePolicy;

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}

    falsePolicy = await deployContract('policies/FalsePolicy', opts);
    truePolicy  = await deployContract('policies/TruePolicy', opts);
});

test('PriceFeed', async t => {
    let pricefeed = await deployContract('policies/mocks/MockPriceFeed', opts);

    const mockOne = "0x1110E6384FEA0791E18151C531FE70DA23C55FA2";
    const mockTwo = "0x222B2A235627AC97EABC6452F98CE296A1EF3984";

    await pricefeed.methods.update([mockOne, mockTwo], [2, 3]).send();

    t.is((await pricefeed.methods.getPrice(mockOne).call())['price'], '2')
    t.is((await pricefeed.methods.getPrice(mockTwo).call())['price'], '3')
})

async function createManagerAndRegister(contract, policy) {
    let manager = await deployContract(contract, opts);
    await manager.methods.register(testPolicy, policy).send();
    return manager;
}

test('Boolean policies', async t => {
    t.false(await falsePolicy.methods.rule(DUMMY_ADDR, DUMMY_VALS).call())
    t.true(await truePolicy.methods.rule(DUMMY_ADDR, DUMMY_VALS).call())
})

test('Boolean policies on policy manager', async t => {
    let manager1 = await createManagerAndRegister('policies/PolicyManager', falsePolicy.options.address)
    await t.throws(manager1.methods.preValidate(testPolicy, DUMMY_ADDR, DUMMY_VALS).call())

    let manager2 = await createManagerAndRegister('policies/PolicyManager', truePolicy.options.address)
    await t.notThrows(manager2.methods.preValidate(testPolicy, DUMMY_ADDR, DUMMY_VALS).call())
})

test('Boolean policies on fund', async t => {
    let manager1 = await createManagerAndRegister('policies/mocks/MockFund', truePolicy.options.address)
    await t.notThrows(manager1.methods.testPolicy(DUMMY_ADDR, DUMMY_VALS).call())

    let manager2 = await createManagerAndRegister('policies/mocks/MockFund', falsePolicy.options.address)
    await t.throws(manager2.methods.testPolicy(DUMMY_ADDR, DUMMY_VALS).call())
})
