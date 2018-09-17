
import test from "ava";
import web3 from "../../../utils/lib/web3";
import Api from '@parity/api';
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
        "name": "Asset gav is higher than the concentration limit %",
        "concentration": 100000000000000000,
        "asset": mockOne,
        "asset_gav": 100010000000000000,
        "total_gav": 1000000000000000000,
        "result": false
    },
    {
        "name": "Asset gav is equal to the concentration limit %",
        "concentration": 100000000000000000,
        "asset": mockOne,
        "asset_gav": 100000000000000000,
        "total_gav": 1000000000000000000,
        "result": true
    },
    {
        "name": "Asset gav is lower to the concentration limit %",
        "concentration": 100000000000000000,
        "asset": mockOne,
        "asset_gav": 90000000000000000,
        "total_gav": 1000000000000000000,
        "result": true
    },
    {
        "name": "Allow gav higher than concentration limit % if it is the quote asset",
        //"concentration": 100000000000000000,
        "concentration": 100000000000000000,
        "asset": mockTwo,
        "asset_gav": 1000000000000000000,
        "total_gav": 1000000000000000000,
        "result": true
    },
]

//let testPolicy1 = '0xd7fb3e27'; // testPolicy(address[5],uint256[3])
let testPolicy = Api.util.sha3('testPolicy(address[5],uint256[3])').substring(0, 10);

for (const indx in tests) {
    const {concentration, asset, asset_gav, total_gav, result, name} = tests[indx];

    test(name, async t => {
        const maxConcentration = await deployContract('risk-management/MaxConcentration', opts, [concentration]);
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

test('Testing getMaxConcentraton...', async t => {

    var concentration = 100000000000000000;

    const maxConcentrationPolicy = await deployContract('risk-management/MaxConcentration', opts, [concentration])

    //Example: 10% => 0.10 => 100,000,000,000,000,000 => 17 0's when working with 18 decimals => 10^17
    t.is(Number(await maxConcentrationPolicy.methods.getMaxConcentration().call()), concentration);

});

test('Testing maxConcentraton construction; > 100% ...', async t => {

    var concentration = 1010000000000000000;

    //expect policy construction to fail
    await t.throws(deployContract('risk-management/MaxConcentration', opts, [concentration]));

});
