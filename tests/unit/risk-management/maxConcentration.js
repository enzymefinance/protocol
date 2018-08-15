
import test from "ava";
const BigNumber = require("bignumber.js");

import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";

let opts;

const mockOne   = "0x1111111111111111111111111111111111111111";
const EMPTY     = '0x0000000000000000000000000000000000000000';

const DUMMY_ADDR = [EMPTY, EMPTY, EMPTY, EMPTY];
const DUMMY_VALS = [0, 0, 0];

test.before(async () => {
    const accounts = await web3.eth.getAccounts();
    const [deployer,] = accounts;
    opts = {from: deployer, gas: 8000000}
});

test('Max concentration', async t => {

    let tests = [
        {
            "concentration": 100000000000000000,
            "asset": 100010000000000000,
            "gav": 1000000000000000000,
            "result": false,
        },
        {
            "concentration": 100000000000000000,
            "asset": 100000000000000000,
            "gav": 1000000000000000000,
            "result": true,
        }
    ]
    
    for (const indx in tests) {
        const {concentration, asset, gav, result} = tests[indx];

        const maxConcentration = await deployContract('risk-management/MaxConcentration', opts, [concentration])
        let mockFund = await deployContract('policies/mocks/MockFund', opts);
    
        await mockFund.methods.setAssetGav(mockOne, asset).send();
        await mockFund.methods.setCalcGav(gav).send();
    
        let res = await mockFund.methods.testMaxConcetration(maxConcentration.options.address, mockOne).call();
        
        if (res['5'] != result) {
            t.fail(`Test ${indx} failed`)
        } else {
            t.pass();
        }
    }
});
