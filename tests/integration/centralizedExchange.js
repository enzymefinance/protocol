import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let investor;
let manager;
let mlnToken;
let pricefeed;
let exchangeOwner;
let trade1;
let version;
let deployed;

// declare function signatures
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
const cancelOrderSignature = api.util
  .abiSignature("cancelOrder", [
    "address",
    "address[5]",
    "uint256[8]",
    "bytes32",
    "uint8",
    "bytes32",
    "bytes32",
  ])
  .slice(0, 10);

// mock data
const offeredValue = new BigNumber(10 ** 10);
const wantedShares = new BigNumber(10 ** 10);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor, , exchangeOwner] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  deployed.CentralizedExchangeBridge = await deployContract(
    "exchange/thirdparty/CentralizedExchangeBridge", { from: deployer }
  );
  await governanceAction(
    { from: deployer },
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerExchange",
    [
      deployed.CentralizedExchangeBridge.address,
      deployed.CentralizedAdapter.address,
      true,
      [makeOrderSignature, cancelOrderSignature],
    ],
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Suisse Fund",
      deployed.EthToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.CentralizedExchangeBridge.address],
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

test.beforeEach(async () => {
  await updateCanonicalPriceFeed(deployed);

  const [
    ,
    referencePrice,
  ] = await pricefeed.instance.getReferencePriceInfo.call({}, [
    ethToken.address,
    mlnToken.address,
  ]);
  const sellQuantity1 = new BigNumber(10 * 19);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: Math.round(referencePrice / 10 ** 18 * sellQuantity1),
  };
});

test.serial(
  "transfer ownership of exchange from deployer to new owner",
  async t => {
    const oldOwner = await deployed.CentralizedExchangeBridge.instance.owner.call(
      {},
      [],
    );
    await deployed.CentralizedExchangeBridge.instance.changeOwner.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [exchangeOwner],
    );
    const newOwner = await deployed.CentralizedExchangeBridge.instance.owner.call(
      {},
      [],
    );
    t.is(oldOwner, deployer);
    t.is(newOwner, exchangeOwner);
  },
);

const initialTokenAmount = new BigNumber(10 ** 20);
test.serial("investor receives initial ethToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.EthToken,
    new BigNumber(pre.investor.EthToken).add(initialTokenAmount),
  );

  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(
  "fund receives ETH from a investment (request & execute)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas },
      [fund.address, offeredValue],
    );
    await fund.instance.requestInvestment.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [offeredValue, wantedShares, ethToken.address],
    );
    await updateCanonicalPriceFeed(deployed);
    await updateCanonicalPriceFeed(deployed);
    const requestId = await fund.instance.getLastRequestId.call({}, []);
    await fund.instance.executeRequest.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [requestId],
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(
      post.investor.EthToken,
      pre.investor.EthToken.minus(offeredValue),
    );
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(offeredValue));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial(
  "Manager makes an order through centralized exchange adapter",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await updateCanonicalPriceFeed(deployed);
    await fund.instance.callOnExchange.postTransaction(
      { from: manager, gas: config.gas },
      [
        0,
        makeOrderSignature,
        ["0x0", "0x0", ethToken.address, mlnToken.address, "0x0"],
        [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
        "0x0",
        0,
        "0x0",
        "0x0",
      ],
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const heldInExchange = await fund.instance.quantityHeldInCustodyOfExchange.call(
      {},
      [ethToken.address],
    );

    t.deepEqual(heldInExchange, trade1.sellQuantity);
    t.deepEqual(
      post.exchangeOwner.EthToken,
      pre.exchangeOwner.EthToken.add(trade1.sellQuantity),
    );
    t.deepEqual(post.exchangeOwner.MlnToken, pre.exchangeOwner.MlnToken);
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(trade1.sellQuantity));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("Manager settles an order on the exchange interface", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const orderId = await deployed.CentralizedExchangeBridge.instance.getLastOrderId.call(
    {},
    [],
  );
  await mlnToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice, gas: config.gas },
    [deployed.CentralizedExchangeBridge.address, trade1.buyQuantity],
  );
  await deployed.CentralizedExchangeBridge.instance.settleOrder.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, trade1.buyQuantity],
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.instance.quantityHeldInCustodyOfExchange.call(
    {},
    [ethToken.address],
  );

  t.is(Number(heldInExchange), 0);
  t.deepEqual(
    post.deployer.MlnToken,
    pre.deployer.MlnToken.minus(trade1.buyQuantity),
  );
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.buyQuantity));
  t.deepEqual(post.exchangeOwner.MlnToken, pre.exchangeOwner.MlnToken);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("Manager cancels an order from the fund", async t => {
  await updateCanonicalPriceFeed(deployed);
  await fund.instance.callOnExchange.postTransaction(
    { from: manager, gas: config.gas },
    [
      0,
      api.util
        .abiSignature("makeOrder", [
          "address",
          "address[5]",
          "uint256[8]",
          "bytes32",
          "uint8",
          "bytes32",
          "bytes32",
        ])
        .slice(0, 10),
      ["0x0", "0x0", mlnToken.address, ethToken.address, "0x0"],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0],
      "0x0",
      0,
      "0x0",
      "0x0",
    ],
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  await mlnToken.instance.transfer.postTransaction(
    { from: exchangeOwner, gasPrice: config.gasPrice, gas: config.gas },
    [manager, trade1.sellQuantity, ""],
  );
  await mlnToken.instance.approve.postTransaction(
    { from: manager, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, trade1.sellQuantity],
  );
  const orderId = await deployed.CentralizedExchangeBridge.instance.getLastOrderId.call();
  await fund.instance.callOnExchange.postTransaction(
    { from: manager, gas: config.gas },
    [
      0,
      cancelOrderSignature,
      ["0x0", "0x0", mlnToken.address, "0x0", "0x0"],
      [0, 0, 0, 0, 0, 0, 0, 0],
      `0x${Number(orderId)
        .toString(16)
        .padStart(64, "0")}`,
      0,
      "0x0",
      "0x0",
    ],
  );
  // TODO: check that the order is cancelled (need order ID, which requires 2D mapping access from parity.js)
  // const orderId = await fund.instance.exchangeIdsToOpenMakeOrderIds.call({}, [0, mlnToken.address]);
  // const orderOpen = await exchanges[0].instance.isActive.call({}, [orderId]);
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.instance.quantityHeldInCustodyOfExchange.call(
    {},
    [mlnToken.address],
  );

  t.is(Number(heldInExchange), 0);
  // t.false(orderOpen);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.sellQuantity));
  t.deepEqual(
    post.exchangeOwner.MlnToken,
    pre.exchangeOwner.MlnToken.minus(trade1.sellQuantity),
  );
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
