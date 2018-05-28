import test from "ava";
import api from "../../../utils/lib/api";
import {deployContract} from "../../../utils/lib/contracts";
import deployEnvironment from "../../../utils/deploy/contracts";

const environmentConfig = require("../../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let operator;
let voter;
let opts;

// mock data
const registeredModule = "0x0089c3fb6a503c7a1eab2d35cfbfa746252aad15";
const mockName = "My Module";
const mockUrl = "www.sample.com";
const mockIpfsHash =
  "0xd8344c361317e3736173f8da91dec3ca1de32f3cc0a895fd6363fbc20fd21985";
const mockAccountRepo = "melonport/protocol";
const mockCommitHash = "0x892ba2d26d1a1dcca471a4d2babeff8efda0c3da";

test.before(async () => {
  await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, operator, voter] = accounts;
  opts = { from: deployer, gas: config.gas };
});

test.beforeEach(async t => {
  t.context.simpleCertifier = await deployContract("modules/SimpleCertifier", opts);
  t.context.moduleRegistrar = await deployContract("modules/ModuleRegistrar", opts, [t.context.simpleCertifier.address]);
  await t.context.moduleRegistrar.instance.register.postTransaction({ from: operator, gas: config.gas}, [
    registeredModule,
    mockName,
    11,
    mockUrl,
    mockIpfsHash,
    mockAccountRepo,
    mockCommitHash
  ]);
});

test("Operator can register a module", async t => {
  const moduleOperated = await t.context.moduleRegistrar.instance.creatorOperatesModules.call(
    {},
    [operator],
  );
  const result = await t.context.moduleRegistrar.instance.information.call({}, [
    moduleOperated,
  ]);
  const [
    name,
    moduleClass,
    creator,
    url,
    ipfsHash,
    accountRepo,
    commitHash,
    sumOfRating,
    numberOfVoters,
    exists
  ] = Object.values(result);

  t.is(registeredModule.toUpperCase(), moduleOperated.toUpperCase());
  t.is(name, mockName);
  t.is(Number(moduleClass), 11);
  t.is(creator, operator);
  t.is(url, mockUrl);
  t.is(ipfsHash, mockIpfsHash);
  t.is(accountRepo, mockAccountRepo);
  t.is(api.util.bytesToHex(commitHash), mockCommitHash);
  t.is(Number(sumOfRating), 0);
  t.is(Number(numberOfVoters), 0);
  t.true(exists);
});

test("Voting updates rating and no of voters correctly", async t => {
  await t.context.simpleCertifier.instance.certify.postTransaction({ from: deployer, gas: config.gas}, [voter]);
  await t.context.moduleRegistrar.instance.vote.postTransaction({ from: voter, gas: config.gas},
    [registeredModule, 5],
  );
  const result = await t.context.moduleRegistrar.instance.information.call({}, [
    registeredModule,
  ]);
  const [ , , , , , , , sumOfRating, numberOfVoters, ] = Object.values(result);

  t.is(Number(sumOfRating), 5);
  t.is(Number(numberOfVoters), 1);
});

test("Operator removes a module", async t => {
  await t.context.moduleRegistrar.instance.remove.postTransaction({ from: operator, gas: config.gas},
    [registeredModule],
  );
  const result = await t.context.moduleRegistrar.instance.information.call({}, [
    registeredModule,
  ]);
  const moduleOperated = await t.context.moduleRegistrar.instance.creatorOperatesModules.call(
    {},
    [operator],
  );
  const [ , , , , , , , , , exists] = Object.values(result);

  t.is(moduleOperated, "0x0000000000000000000000000000000000000000");
  t.false(exists);
});
