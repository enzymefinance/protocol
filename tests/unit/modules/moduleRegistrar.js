import test from "ava";
import Api from "@parity/api";

const environmentConfig = require("../../../utils/config/environment.js");
const fs = require("fs");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let deployer;
let operator;
let voter;
let simpleCertifier;
let moduleRegistrar;

// mock data
const registeredModule = "0x0089c3fb6a503c7a1eab2d35cfbfa746252aad15";
const mockName = "My Module";
const mockUrl = "www.sample.com";
const mockIpfsHash =
  "0xd8344c361317e3736173f8da91dec3ca1de32f3cc0a895fd6363fbc20fd21985";

// helper functions
async function registerModule() {
  await moduleRegistrar.instance.register.postTransaction({ from: operator, gas: config.gas}, [
    registeredModule,
    mockName,
    11,
    mockUrl,
    mockIpfsHash,
  ]);
}

test.before(async () => {
  accounts = await api.eth.accounts();
  deployer = accounts[0];
  operator = accounts[1];
  voter = accounts[2];
});

test.beforeEach(async () => {
  const opts = { from: deployer, gas: config.gas };
  // Deploy Simple Certifier
  let abi = JSON.parse(fs.readFileSync("./out/modules/SimpleCertifier.abi"));
  let bytecode = fs.readFileSync("./out/modules/SimpleCertifier.bin");
  opts.data = `0x${bytecode}`;
  simpleCertifier = await api.newContract(abi).deploy(opts, []);
  simpleCertifier = await api.newContract(abi, simpleCertifier);

  // Deploy Module Registrar
  abi = JSON.parse(fs.readFileSync("./out/modules/ModuleRegistrar.abi"));
  bytecode = fs.readFileSync("./out/modules/ModuleRegistrar.bin");
  opts.data = `0x${bytecode}`;
  moduleRegistrar = await api
    .newContract(abi)
    .deploy(opts, [simpleCertifier.address]);
  moduleRegistrar = await api.newContract(abi, moduleRegistrar);
  await registerModule();
});

test("Operator can register a module", async t => {
  const moduleOperated = await moduleRegistrar.instance.creatorOperatesModules.call(
    {},
    [operator],
  );
  const result = await moduleRegistrar.instance.information.call({}, [
    moduleOperated,
  ]);
  const [
    name,
    moduleClass,
    creator,
    url,
    ipfsHash,
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
  t.is(Number(sumOfRating), 0);
  t.is(Number(numberOfVoters), 0);
  t.truthy(exists);
});

test("Voting updates rating and no of voters correctly", async t => {
  await simpleCertifier.instance.certify.postTransaction({ from: deployer, gas: config.gas}, [voter]);
  await moduleRegistrar.instance.vote.postTransaction({ from: voter, gas: config.gas},
    [registeredModule, 5],
  );
  const result = await moduleRegistrar.instance.information.call({}, [
    registeredModule,
  ]);
  const [, , , , , sumOfRating, numberOfVoters] = Object.values(result);

  t.is(Number(sumOfRating), 5);
  t.is(Number(numberOfVoters), 1);
});

// Cannot run concurrently due to shared state i.e parity node
test.serial("Operator removes a module", async t => {
  await moduleRegistrar.instance.remove.postTransaction({ from: operator, gas: config.gas},
    [registeredModule],
  );
  const result = await moduleRegistrar.instance.information.call({}, [
    registeredModule,
  ]);
  const moduleOperated = await moduleRegistrar.instance.creatorOperatesModules.call(
    {},
    [operator],
  );
  const [, , , , , , , exists] = Object.values(result);

  t.is(moduleOperated, "0x0000000000000000000000000000000000000000");
  t.falsy(exists);
});
