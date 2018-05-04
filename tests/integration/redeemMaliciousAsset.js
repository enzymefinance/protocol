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
let ethToken;
let maliciousToken;
let deployed;

const mockBytes =
  "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const initialEth = 1000000;
const offeredEth = 500000;
const wantedShares = 500000;
const sellQuantity = 1000;
const buyQuantity = 1000;

// define order signatures
const makeOrderSignature = api.util
  .abiSignature("makeOrder", [
    "address",
    "address[5]",
    "uint256[8]",
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
  ethToken = await deployed.EthToken;
  maliciousToken = await deployContract("testing/MaliciousToken", { from: deployer });
  await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(
    { from: deployer }, [ethToken.address, maliciousToken.address]
  );
  await governanceAction(
    { from: deployer }, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    [
      deployed.MatchingMarket.address,
      deployed.MatchingMarketAdapter.address,
      true,
      [ makeOrderSignature ]
    ]
  );
  await governanceAction(
    opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset',
    [
      maliciousToken.address, 'MaliciousToken', 'MAL', 18, '',
      mockBytes, [mockAddress, mockAddress], [], []
    ]
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
      [mockAddress, mockAddress],
      [],
      [],
    ],
  );

  // give investor some Eth to use
  await ethToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialEth, ""],
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Fund", // same name as before
      ethToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      [],
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

test.serial("initial investment with ETH", async t => {
  await updateCanonicalPriceFeed(deployed, {
    [deployed.MlnToken.address]: 10 ** 18,
    [maliciousToken.address]: 10 ** 18,
    [deployed.EthToken.address]: 10 ** 18,
    [deployed.EurToken.address]: 10 ** 18,
  });
  await ethToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, offeredEth],
  );
  await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [offeredEth, wantedShares, ethToken.address],
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

test.serial("fund buys some mlnToken", async t => {
  await updateCanonicalPriceFeed(deployed, {
    [deployed.MlnToken.address]: 10 ** 18,
    [maliciousToken.address]: 10 ** 18,
    [deployed.EthToken.address]: 10 ** 18,
    [deployed.EurToken.address]: 10 ** 18,
  });
  await fund.instance.callOnExchange.postTransaction(
    { from: manager, gas: config.gas },
    [
      0,
      makeOrderSignature,
      ["0x0", "0x0", ethToken.address, mlnToken.address, "0x0"],
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
  await mlnToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [deployed.MatchingMarket.address, buyQuantity],
  );

  // third party takes order
  await deployed.MatchingMarket.instance.buy.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, sellQuantity],
  );

  const mlnBalance = Number(
    await mlnToken.instance.balanceOf.call({}, [fund.address]),
  );

  t.is(mlnBalance, buyQuantity);
});

test.serial("fund buys some MaliciousToken", async t => {
  await fund.instance.callOnExchange.postTransaction(
    { from: manager, gas: config.gas },
    [
      0,
      makeOrderSignature,
      ["0x0", "0x0", ethToken.address, maliciousToken.address, "0x0"],
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
      [preShareQuantity, [mlnToken.address, ethToken.address]],
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
      Number(preMlnQuantity) + buyQuantity,
    );
    t.is(
      Number(postEthTokenQuantity),
      Number(preEthTokenQuantity) + (offeredEth - sellQuantity - sellQuantity),
    );
  },
);
