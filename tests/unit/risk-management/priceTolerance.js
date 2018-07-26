
import test from "ava";
import Api from '@parity/api';
const BigNumber = require("bignumber.js");

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let opts;

const mockOne = "0x1111111111111111111111111111111111111111";
const mockTwo = "0x2222222222222222222222222222222222222222"; 
const mockThree = "0x3333333333333333333333333333333333333333"; 

const EMPTY = '0x0000000000000000000000000000000000000000';

const DUMMY_ADDR = [EMPTY, EMPTY, EMPTY, EMPTY];
const DUMMY_VALS = [0, 0];

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

const toDec = (val, decimals=18) => (new BigNumber(val)).times(10 ** decimals);

test('Mock PriceTolerance', async t => {
    let mockFund = await deployContract('policies/mocks/MockFund', opts);
    let mockPriceFeed = await deployContract('policies/mocks/MockPriceFeed', opts);

    await mockFund.methods.setPriceFeed(mockPriceFeed.options.address).send()
    await mockPriceFeed.methods.update([mockOne, mockTwo], [toDec(10), toDec(20)]).send()

    let priceTolerance = await deployContract('risk-management/PriceTolerance', opts, [10])

    console.log("- price -")
    console.log(await mockFund.methods.testPriceTolerance(priceTolerance.options.address, mockOne, mockTwo, toDec(0.55)).call());

    t.true(true)
})

test('Real Fund', async t => {

})
