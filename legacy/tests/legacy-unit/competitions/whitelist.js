import test from "ava";
import web3 from "../../../utils/lib/web3";
import deployEnvironment from "../../../utils/deploy/contracts";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let opts;
let deployed;
let competition;
let competitionCompliance;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };
  competition = deployed.Competition;
  competitionCompliance = deployed.CompetitionCompliance;
});

test("Owner of competition can add addresses to whitelist", async t => {
  await competition.methods.batchAddToWhitelist(100000000000000, [accounts[4], accounts[5]]).send(opts);
  const buyins = [
    Number(
      await competition.methods.whitelistantToMaxBuyin(accounts[4]).call(),
    ),
    Number(
      await competition.methods.whitelistantToMaxBuyin(accounts[5]).call(),
    ),
  ];
  const areWhitelisted = [
    await competitionCompliance.methods.isCompetitionAllowed(accounts[4]).call(),
    await competitionCompliance.methods.isCompetitionAllowed(accounts[5]).call(),
  ];
  t.deepEqual(buyins, [100000000000000, 100000000000000]);
  t.deepEqual(areWhitelisted, [true, true]);
});

test("Owner of competition can remove addresses from whitelist", async t => {
  await competition.methods.batchAddToWhitelist(100000000000000, [accounts[4], accounts[5]]).send(opts);
  const buyinsBefore = [
    Number(
      await competition.methods.whitelistantToMaxBuyin(accounts[4]).call(),
    ),
    Number(
      await competition.methods.whitelistantToMaxBuyin(accounts[5]).call(),
    ),
  ];
  const areWhitelistedBefore = [
    await competitionCompliance.methods.isCompetitionAllowed(accounts[4]).call(),
    await competitionCompliance.methods.isCompetitionAllowed(accounts[5]).call(),
  ];
  await competition.methods.batchAddToWhitelist(0, [accounts[4], accounts[5]]).send(opts);

  const buyinsAfter = [
    Number(
      await competition.methods.whitelistantToMaxBuyin(accounts[4]).call(),
    ),
    Number(
      await competition.methods.whitelistantToMaxBuyin(accounts[5]).call(),
    ),
  ];
  const areWhitelistedAfter = [
    await competitionCompliance.methods.isCompetitionAllowed(accounts[4]).call(),
    await competitionCompliance.methods.isCompetitionAllowed(accounts[5]).call(),
  ];
  t.deepEqual(buyinsBefore, [100000000000000, 100000000000000]);
  t.deepEqual(areWhitelistedBefore, [true, true]);
  t.deepEqual(buyinsAfter, [0, 0]);
  t.deepEqual(areWhitelistedAfter, [false, false]);
});
