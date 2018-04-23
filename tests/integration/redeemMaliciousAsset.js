import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";
import governanceAction from "../../utils/lib/governanceAction";

const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let fund;
let manager;
let investor;
let opts;
let version;
let mlnToken;
let maliciousToken;
let deployed;

const mockBytes =
  "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const initialMln = 1000000;
const offeredMln = 500000;
const wantedShares = 500000;
const sellQuantity = 1000;
const buyQuantity = 1000;

// define order signatures
const makeOrderSignature = api.util
  .abiSignature("makeOrder", [
    "address",
    "address[5]",
    "uint256[6]",
    "bytes32",
    "uint8",
    "bytes32",
    "bytes32",
  ])
  .slice(0, 10);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  mlnToken = await deployed.MlnToken;
  maliciousToken = await deployContract("testing/MaliciousToken", {
    from: deployer,
  });
  await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(
    { from: deployer },
    [mlnToken.address, maliciousToken.address],
  );
  await governanceAction(
    opts,
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerAsset",
    [
      maliciousToken.address,
      "MaliciousToken",
      "MAL",
      18,
      "",
      mockBytes,
      mockAddress,
      mockAddress,
      [],
      [],
    ],
  );

  // give investor some MLN to use
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialMln, ""],
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Fund with malicious token", // name
      deployed.MlnToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.instance.changeCompetitionAddress.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [investor],
  );
});

test.serial("initial investment with MLN", async t => {
  await updateCanonicalPriceFeed(deployed, {
    [deployed.MlnToken.address]: 10 ** 18,
    [maliciousToken.address]: 10 ** 18,
    [deployed.EthToken.address]: 10 ** 18,
  });
  await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, offeredMln],
  );
  await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [offeredMln, wantedShares, mlnToken.address],
  );
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  const ownedShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );

  t.deepEqual(ownedShares, wantedShares);
});

test.serial("fund buys some EthToken", async t => {
  await fund.instance.callOnExchange.postTransaction(
    { from: manager, gas: config.gas },
    [
      0,
      makeOrderSignature,
      ["0x0", "0x0", mlnToken.address, deployed.EthToken.address, "0x0"],
      [sellQuantity, buyQuantity, 0, 0, 0, 0],
      "0x0",
      0,
      "0x0",
      "0x0",
    ],
  );
  const orderId = await deployed.MatchingMarket.instance.last_offer_id.call(
    {},
    [],
  );
  await deployed.EthToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [deployed.MatchingMarket.address, buyQuantity + 100],
  );

  // third party takes order
  await deployed.MatchingMarket.instance.buy.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, sellQuantity],
  );

  const ethTokenBalance = Number(
    await deployed.EthToken.instance.balanceOf.call({}, [fund.address]),
  );

  t.is(ethTokenBalance, buyQuantity);
});

test.serial("fund buys some MaliciousToken", async t => {
  await fund.instance.callOnExchange.postTransaction(
    { from: manager, gas: config.gas },
    [
      0,
      makeOrderSignature,
      ["0x0", "0x0", mlnToken.address, maliciousToken.address, "0x0"],
      [sellQuantity, buyQuantity, 0, 0, 0, 0],
      "0x0",
      0,
      "0x0",
      "0x0",
    ],
  );
  const orderId = await deployed.MatchingMarket.instance.last_offer_id.call(
    {},
    [],
  );
  await maliciousToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [deployed.MatchingMarket.address, buyQuantity + 100],
  );

  // third party takes order
  await deployed.MatchingMarket.instance.buy.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, sellQuantity],
  );

  const maliciousBalance = Number(
    await maliciousToken.instance.balanceOf.call({}, [fund.address]),
  );

  t.is(maliciousBalance, buyQuantity);
});

test.serial("MaliciousToken becomes malicious", async t => {
  await maliciousToken.instance.startThrowing.postTransaction({}, []);

  const isThrowing = await maliciousToken.instance.isThrowing.call({}, []);
  t.true(isThrowing);
});

test.serial("Cannot pass asset multiple times in emergencyRedeem", async t => {
  const preShareQuantity = await fund.instance.balanceOf.call({}, [investor]);
  const preMlnQuantity = await mlnToken.instance.balanceOf.call({}, [investor]);
  const preEthTokenQuantity = await deployed.EthToken.instance.balanceOf.call(
    {},
    [investor],
  );
  await fund.instance.emergencyRedeem.postTransaction(
    { from: investor, gas: 6000000 },
    [
      preShareQuantity,
      [mlnToken.address, mlnToken.address, deployed.EthToken.address],
    ],
  );
  const postShareQuantity = await fund.instance.balanceOf.call({}, [investor]);
  const postMlnQuantity = await mlnToken.instance.balanceOf.call({}, [
    investor,
  ]);
  const postEthTokenQuantity = await deployed.EthToken.instance.balanceOf.call(
    {},
    [investor],
  );

  t.is(Number(preShareQuantity), Number(postShareQuantity));
  t.is(Number(preMlnQuantity), Number(postMlnQuantity));
  t.is(Number(preEthTokenQuantity), Number(postEthTokenQuantity));
});

test.serial(
  "Other assets can be redeemed, when MaliciousToken is throwing",
  async t => {
    const preShareQuantity = await fund.instance.balanceOf.call({}, [investor]);
    const preMlnQuantity = await mlnToken.instance.balanceOf.call({}, [
      investor,
    ]);
    const preEthTokenQuantity = await deployed.EthToken.instance.balanceOf.call(
      {},
      [investor],
    );
    await fund.instance.emergencyRedeem.postTransaction(
      { from: investor, gas: 6000000 },
      [preShareQuantity, [mlnToken.address, deployed.EthToken.address]],
    );
    const postShareQuantity = await fund.instance.balanceOf.call({}, [
      investor,
    ]);
    const postMlnQuantity = await mlnToken.instance.balanceOf.call({}, [
      investor,
    ]);
    const postEthTokenQuantity = await deployed.EthToken.instance.balanceOf.call(
      {},
      [investor],
    );

    t.is(Number(postShareQuantity), 0);
    t.is(
      Number(postMlnQuantity),
      Number(preMlnQuantity) + (offeredMln - sellQuantity - sellQuantity),
    );
    t.is(
      Number(postEthTokenQuantity),
      Number(preEthTokenQuantity) + buyQuantity,
    );
  },
);
