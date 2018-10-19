import test from "ava";
import web3 from "../../utils/lib/web3";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");
const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let investor;
let manager;

test.before(async t => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
});

test.beforeEach(async () => {
});

