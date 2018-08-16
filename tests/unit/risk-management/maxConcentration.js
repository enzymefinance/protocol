
import test from "ava";

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let opts;

const mockOne   = "0x1111111111111111111111111111111111111111";
const mockTwo   = "0x2222222222222222222222222222222222222222";
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
        "asset": mockOne,
        "asset_gav": 100010000000000000,
        "total_gav": 1000000000000000000,
        "result": false
    },
    {
        "name": "Asset gav is equal to the concentration",
        "concentration": 100000000000000000,
        "asset": mockOne,
        "asset_gav": 100000000000000000,
        "total_gav": 1000000000000000000,
        "result": true
    },
    {
        "name": "Asset gav is lower to the concentration",
        "concentration": 100000000000000000,
        "asset": mockOne,
        "asset_gav": 90000000000000000,
        "total_gav": 1000000000000000000,
        "result": true
    },
    {
        "name": "Allow gav higher than concentration if its quote asset",
        "concentration": 100000000000000000,
        "asset": mockTwo,
        "asset_gav": 1000000000000000000,
        "total_gav": 1000000000000000000,
        "result": true
    },
]

let testPolicy = '0xd7fb3e27'; // testPolicy(address[5],uint256[3])

for (const indx in tests) {
    const {concentration, asset, asset_gav, total_gav, result, name} = tests[indx];

    test(name, async t => {
        const maxConcentration = await deployContract('risk-management/MaxConcentration', opts, [concentration])
        let mockFund = await deployContract('policies/mocks/MockFund', opts);

        // Set a mock pricefeed
        let mockPriceFeed = await deployContract('policies/mocks/MockPriceFeed', opts);
        await mockPriceFeed.methods.setQuoteAsset(mockTwo).send();
        await mockFund.methods.setPriceFeed(mockPriceFeed.options.address).send();

        await mockFund.methods.register(testPolicy, maxConcentration.options.address).send();

        await mockFund.methods.setAssetGav(asset, asset_gav).send();
        await mockFund.methods.setCalcGav(total_gav).send();

        let func = mockFund.methods.testPolicy([EMPTY, EMPTY, EMPTY, asset, EMPTY], DUMMY_VALS).send();

        if (result) {
            await t.notThrows(func);
        } else {
            await t.throws(func);
        }
    });
}
