
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

let testMaxPositions = Api.util.sha3('testMaxPositions(address[4],uint256[2],uint256)').substring(0, 10);

test('Max positions', async t => {

    const maxPositions = await deployContract('risk-management/MaxPositions', opts, [2])
    console.log(maxPositions.options.address);

    let mockFund = await deployContract('policies/mocks/MockFund', opts);
    await mockFund.methods.register(testMaxPositions, maxPositions.options.address).send();

    await t.notThrows(mockFund.methods.testMaxPositions(DUMMY_ADDR, DUMMY_VALS, 2).send())
    await t.throws(mockFund.methods.testMaxPositions(DUMMY_ADDR, DUMMY_VALS, 3).send())
})
