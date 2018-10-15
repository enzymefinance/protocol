
import test from "ava";

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let opts;

const mockOne   = "0x1111111111111111111111111111111111111111";
const EMPTY     = '0x0000000000000000000000000000000000000000';

const DUMMY_VALS = [0, 0, 0];

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

let tests = [
    {
        "name": "Asset gav is higher than the concentration",
        "concentration": 100000000000000000,
        "asset": 100010000000000000,
        "gav": 1000000000000000000,
        "result": false
    },
    {
        "name": "Asset gav is equal to the concentration",
        "concentration": 100000000000000000,
        "asset": 100000000000000000,
        "gav": 1000000000000000000,
        "result": true
    },
    {
        "name": "Asset gav is lower to the concentration",
        "concentration": 100000000000000000,
        "asset": 90000000000000000,
        "gav": 1000000000000000000,
        "result": true
    }
]

let testPolicy = '0xd7fb3e27'; // testPolicy(address[5],uint256[3])

for (const indx in tests) {
    const {concentration, asset, gav, result, name} = tests[indx];

    test(name, async t => {
        const maxConcentration = await deployContract('risk-management/MaxConcentration', opts, [concentration])
        let mockFund = await deployContract('policies/mocks/MockFund', opts);
        await mockFund.methods.register(testPolicy, maxConcentration.options.address).send();

        await mockFund.methods.setAssetGav(mockOne, asset).send();
        await mockFund.methods.setCalcGav(gav).send();

        let func = mockFund.methods.testPolicy([EMPTY, EMPTY, EMPTY, mockOne, EMPTY], DUMMY_VALS).send();

        if (result) {
            await t.notThrows(func);
        } else {
            await t.throws(func);
        }
    });
}
