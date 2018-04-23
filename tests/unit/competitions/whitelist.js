import test from "ava";
import api from "../../../utils/lib/api";
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
  accounts = await api.eth.accounts();
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };
  competition = deployed.Competition;
  competitionCompliance = deployed.CompetitionCompliance;
});

test("Owner of competition can add addresses to whitelist", async t => {
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [accounts[4], accounts[5]],
  ]);
  const buyins = [
    Number(await competition.instance.whitelistantToMaxBuyin.call({}, [accounts[4]])),
    Number(await competition.instance.whitelistantToMaxBuyin.call({}, [accounts[5]])),
  ];
  const areWhitelisted = [
    await competitionCompliance.instance.isCompetitionWhitelisted.call({}, [accounts[4]]),
    await competitionCompliance.instance.isCompetitionWhitelisted.call({}, [accounts[5]])
  ];
  t.deepEqual(buyins, [10 ** 22, 10 ** 22]);
  t.deepEqual(areWhitelisted, [true, true]);
});

test("Owner of competition can remove addresses from whitelist", async t => {
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [
    10 ** 22,
    [accounts[4], accounts[5]],
  ]);
  const buyinsBefore = [
    Number(await competition.instance.whitelistantToMaxBuyin.call({}, [accounts[4]])),
    Number(await competition.instance.whitelistantToMaxBuyin.call({}, [accounts[5]])),
  ];
  const areWhitelistedBefore = [
    await competitionCompliance.instance.isCompetitionWhitelisted.call({}, [accounts[4]]),
    await competitionCompliance.instance.isCompetitionWhitelisted.call({}, [accounts[5]])
  ];
  await competition.instance.batchAddToWhitelist.postTransaction(opts, [
    0,
    [accounts[4], accounts[5]],
  ]);
  const buyinsAfter = [
    Number(await competition.instance.whitelistantToMaxBuyin.call({}, [accounts[4]])),
    Number(await competition.instance.whitelistantToMaxBuyin.call({}, [accounts[5]])),
  ];
  const areWhitelistedAfter = [
    await competitionCompliance.instance.isCompetitionWhitelisted.call({}, [accounts[4]]),
    await competitionCompliance.instance.isCompetitionWhitelisted.call({}, [accounts[5]])
  ];
  t.deepEqual(buyinsBefore, [10 ** 22, 10 ** 22]);
  t.deepEqual(areWhitelistedBefore, [true, true]);
  t.deepEqual(buyinsAfter, [0, 0]);
  t.deepEqual(areWhitelistedAfter, [false, false]);
});
