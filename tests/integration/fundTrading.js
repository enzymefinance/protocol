import test from "ava";
import api from "../../utils/lib/api";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import deployEnvironment from "../../utils/deploy/contracts";
import {getTermsSignatureParameters} from "../../utils/lib/signing";
import governanceAction from "../../utils/lib/governanceAction";
import {updateCanonicalPriceFeed} from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

BigNumber.config({ ERRORS: false });

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let gasPrice;
let investor;
let manager;
let mlnToken;
let pricefeed;
let txId;
let runningGasTotal;
let exchanges;
let trade1;
let trade2;
let trade3;
let trade4;
let version;
let deployed;

// mock data
const offeredValue = new BigNumber(10 ** 22);
const wantedShares = new BigNumber(10 ** 22);
const numberofExchanges = 2;

// define order signatures
const makeOrderSignature = api.util.abiSignature('makeOrder', [
  'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);
const takeOrderSignature = api.util.abiSignature('takeOrder', [
  'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);
const cancelOrderSignature = api.util.abiSignature('cancelOrder', [
  'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);


test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  gasPrice = Number(await api.eth.gasPrice());
  [deployer, manager, investor] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  exchanges = [deployed.SimpleMarket, deployed.MatchingMarket];
  await governanceAction(
    {from: deployer},
    deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    [
      deployed.SimpleMarket.address,
      deployed.MatchingMarketAdapter.address,
      true,
      [ makeOrderSignature, takeOrderSignature, cancelOrderSignature ]
    ]
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Test fund", // name
      deployed.MlnToken.address, // reference asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.SimpleMarket.address, deployed.MatchingMarket.address],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
  await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [mlnToken.address, ethToken.address],
  );
});

test.beforeEach(async () => {
  runningGasTotal = new BigNumber(0);

  await updateCanonicalPriceFeed(deployed);

  const [, referencePrice] = await pricefeed.instance.getReferencePriceInfo.call(
    {},
    [mlnToken.address, ethToken.address],
  );
  const [
    ,
    invertedReferencePrice,
  ] = await pricefeed.instance.getReferencePriceInfo.call({}, [
    ethToken.address,
    mlnToken.address,
  ]);
  const sellQuantity1 = new BigNumber(10 ** 21);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(
      Math.round(referencePrice.div(10 ** 18).times(sellQuantity1)),
    ),
  };
  const sellQuantity2 = new BigNumber(50 * 10 ** 18);
  trade2 = {
    sellQuantity: sellQuantity2,
    buyQuantity: new BigNumber(
      Math.round(referencePrice / 10 ** 18 * sellQuantity2),
    ),
  };
  const sellQuantity3 = new BigNumber(5 * 10 ** 18);
  trade3 = {
    sellQuantity: sellQuantity3,
    buyQuantity: new BigNumber(
      Math.round(invertedReferencePrice / 10 ** 18 * sellQuantity3 / 10),
    ),
  };
  const sellQuantity4 = new BigNumber(5 * 10 ** 18);
  trade4 = {
    sellQuantity: sellQuantity4,
    buyQuantity: new BigNumber(
      Math.round(invertedReferencePrice / 10 ** 18 * sellQuantity4 * 1000),
    ),
  };
});

const initialTokenAmount = new BigNumber(10 ** 23);
test.serial("investor receives initial mlnToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  txId = await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    postDeployerEth,
    preDeployerEth.minus(runningGasTotal.times(gasPrice)),
  );
  t.deepEqual(
    post.investor.MlnToken,
    pre.investor.MlnToken.add(initialTokenAmount),
  );

  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

const exchangeIndexes = Array.from(
  new Array(numberofExchanges),
  (val, index) => index,
);
exchangeIndexes.forEach(i => {
  test.serial(`fund gets MLN from investment [round ${i + 1}]`, async t => {
    const boostedOffer = offeredValue.times(1.01); // account for increasing share price after trades occur
    let investorGasTotal = new BigNumber(0);
    await mlnToken.instance.transfer.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [investor, new BigNumber(10 ** 14), ""],
    );
    const pre = await getAllBalances(deployed, accounts, fund);
    txId = await mlnToken.instance.approve.postTransaction(
      { from: investor, gas: config.gas },
      [fund.address, boostedOffer],
    );
    let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    txId = await fund.instance.requestInvestment.postTransaction(
      { from: investor, gas: config.gas },
      [boostedOffer, wantedShares, mlnToken.address],
    );
    gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    await updateCanonicalPriceFeed(deployed);
    await updateCanonicalPriceFeed(deployed);
    const totalSupply = await fund.instance.totalSupply.call();
    const requestId = await fund.instance.getLastRequestId.call();
    txId = await fund.instance.executeRequest.postTransaction(
      { from: investor, gas: config.gas }, [requestId]
    );
    gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    // set approved token back to zero
    txId = await mlnToken.instance.approve.postTransaction(
      { from: investor },
      [fund.address, 0],
    );
    investorGasTotal = investorGasTotal.plus(
      (await api.eth.getTransactionReceipt(txId)).gasUsed,
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const [gav, , , unclaimedFees, ,] = Object.values(
      await fund.instance.atLastUnclaimedFeeAllocation.call(),
    );
    const feesShareQuantity = parseInt(
      unclaimedFees
        .mul(totalSupply)
        .div(gav)
        .toNumber(),
      0,
    );
    let sharePrice = await fund.instance.calcValuePerShare.call({}, [
      gav,
      totalSupply.add(feesShareQuantity),
    ]);
    if (sharePrice.toNumber() === 0) {
      sharePrice = new BigNumber(10 ** 18);
    }
    const estimatedMlnSpent = wantedShares
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18));

    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(
      post.investor.ether,
      pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(estimatedMlnSpent));
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  }
);

  test.serial(
    `Exchange ${i +
      1}: manager makes order, and sellToken (MLN-T) is transferred to exchange`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = await mlnToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      const exchangePreEthToken = await ethToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      await updateCanonicalPriceFeed(deployed);
      txId = await fund.instance.callOnExchange.postTransaction(
        {from: manager, gas: config.gas},
        [
          i, makeOrderSignature,
          ['0x0', '0x0', mlnToken.address, ethToken.address, '0x0'],
          [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
          '0x0', 0, '0x0', '0x0'
        ]
      );
      const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = await mlnToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      const exchangePostEthToken = await ethToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln.add(trade1.sellQuantity));
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(
        post.manager.ether,
        pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(
        post.fund.MlnToken,
        pre.fund.MlnToken.minus(trade1.sellQuantity),
      );
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i +
      1}: third party takes entire order, allowing fund to receive ethToken`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const orderId = await exchanges[i].instance.last_offer_id.call({}, []);
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      txId = await ethToken.instance.approve.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [exchanges[i].address, trade1.buyQuantity.add(100)],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      txId = await exchanges[i].instance.buy.postTransaction(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
        [orderId, trade1.sellQuantity],
      );
      gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln - trade1.sellQuantity);
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(
        post.deployer.ether,
        pre.deployer.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(
        post.deployer.MlnToken,
        pre.deployer.MlnToken.add(trade1.sellQuantity),
      );
      t.deepEqual(
        post.deployer.EthToken,
        pre.deployer.EthToken.minus(trade1.buyQuantity),
      );
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
      t.deepEqual(
        post.fund.EthToken,
        pre.fund.EthToken.add(trade1.buyQuantity),
      );
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i +
      1}: third party makes order (sell MLN-T for ETH-T), and MLN-T is transferred to exchange`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = await mlnToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      const exchangePreEthToken = await ethToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      txId = await mlnToken.instance.approve.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [exchanges[i].address, trade2.sellQuantity],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      txId = await exchanges[i].instance.offer.postTransaction(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
        [
          trade2.sellQuantity,
          mlnToken.address,
          trade2.buyQuantity,
          ethToken.address,
        ],
      );
      gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = await mlnToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      const exchangePostEthToken = await ethToken.instance.balanceOf.call({}, [
        exchanges[i].address,
      ]);
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln.add(trade2.sellQuantity));
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(post.deployer.EthToken, pre.deployer.EthToken);
      t.deepEqual(
        post.deployer.MlnToken,
        pre.deployer.MlnToken.minus(trade2.sellQuantity),
      );
      t.deepEqual(
        post.deployer.ether,
        pre.deployer.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i + 1}: manager takes order (buys MLN-T for ETH-T)`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const orderId = await exchanges[i].instance.last_offer_id.call({}, []);
      txId = await fund.instance.callOnExchange.postTransaction(
        {from: manager, gas: config.gas},
        [
          i, takeOrderSignature,
          ['0x0', '0x0', '0x0', '0x0', '0x0'],
          [0, trade2.sellQuantity, 0, 0, 0, 0, 0, 0],
          `0x${Number(orderId).toString(16).padStart(64, '0')}`, 0, '0x0', '0x0'
        ]
      );
      const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln - trade2.sellQuantity);
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
      t.deepEqual(
        post.deployer.EthToken,
        pre.deployer.EthToken.add(trade2.buyQuantity),
      );
      t.deepEqual(post.deployer.ether, pre.deployer.ether);
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(
        post.manager.ether,
        pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(
        post.fund.MlnToken,
        pre.fund.MlnToken.add(trade2.sellQuantity),
      );
      t.deepEqual(
        post.fund.EthToken,
        pre.fund.EthToken.minus(trade2.buyQuantity),
      );
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );
});

test.serial(
  "manager tries to make a bad order (sell ETH-T for MLN-T), RMMakeOrders should prevent this",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreEthToken = await ethToken.instance.balanceOf.call({}, [
      exchanges[0].address,
    ]);
    const preOrderId = await exchanges[0].instance.last_offer_id.call({}, []);
    txId = await fund.instance.callOnExchange.postTransaction(
      {from: manager, gas: config.gas},
      [
        0, makeOrderSignature,
        ['0x0', '0x0', ethToken.address, mlnToken.address, '0x0'],
        [trade3.sellQuantity, trade3.buyQuantity, 0, 0, 0, 0, 0, 0],
        '0x0', 0, '0x0', '0x0'
      ]
    );
    const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const exchangePostEthToken = await ethToken.instance.balanceOf.call({}, [
      exchanges[0].address,
    ]);
    const post = await getAllBalances(deployed, accounts, fund);
    const postOrderId = await exchanges[0].instance.last_offer_id.call({}, []);

    t.deepEqual(preOrderId, postOrderId);
    t.deepEqual(exchangePostEthToken, exchangePreEthToken);
    t.deepEqual(
      post.manager.ether,
      pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  },
);

test.serial(
  "third party makes order (sell ETH-T for MLN-T) for a bad price, and MLN-T is transferred to exchange",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreMln = await mlnToken.instance.balanceOf.call({}, [
      exchanges[0].address,
    ]);
    const exchangePreEthToken = await ethToken.instance.balanceOf.call({}, [
      exchanges[0].address,
    ]);
    txId = await ethToken.instance.approve.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [exchanges[0].address, trade4.sellQuantity],
    );
    let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    txId = await exchanges[0].instance.offer.postTransaction(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
      [
        trade4.sellQuantity,
        ethToken.address,
        trade4.buyQuantity,
        mlnToken.address,
      ],
    );
    gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const exchangePostMln = await mlnToken.instance.balanceOf.call({}, [
      exchanges[0].address,
    ]);
    const exchangePostEthToken = await ethToken.instance.balanceOf.call({}, [
      exchanges[0].address,
    ]);
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(exchangePostMln, exchangePreMln);
    t.deepEqual(
      exchangePostEthToken,
      exchangePreEthToken.add(trade4.sellQuantity),
    );
    t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
    t.deepEqual(
      post.deployer.EthToken,
      pre.deployer.EthToken.minus(trade4.sellQuantity),
    );
    t.deepEqual(
      post.deployer.ether,
      pre.deployer.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial(
  "manager tries to take a bad order (buys ETH-T for MLN-T), RMMakeOrders should prevent it",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreMln = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const exchangePreEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const orderId = await exchanges[0].instance.last_offer_id.call({}, []);

    txId = await fund.instance.callOnExchange.postTransaction(
      {from: manager, gas: config.gas},
      [
        0, takeOrderSignature,
        ['0x0', '0x0', '0x0', '0x0', '0x0'],
        [0, trade4.sellQuantity, 0, 0, 0, 0, 0, 0],
        `0x${Number(orderId).toString(16).padStart(64, '0')}`, 0, '0x0', '0x0'
      ]
    );
    const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const exchangePostMln = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const exchangePostEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(exchangePostMln, exchangePreMln);
    t.deepEqual(exchangePostEthToken, exchangePreEthToken);
    t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
    t.deepEqual(post.deployer.EthToken, pre.deployer.EthToken);
    t.deepEqual(post.deployer.ether, pre.deployer.ether);
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(
      post.manager.ether,
      pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("manager makes an order and cancels it", async t => {
  txId = await fund.instance.callOnExchange.postTransaction(
    {from: manager, gas: config.gas},
    [
      0, makeOrderSignature,
      ['0x0', '0x0', mlnToken.address, ethToken.address, '0x0'],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
      '0x0', 0, '0x0', '0x0'
    ]
  );
  const offerNumber = await deployed.SimpleMarket.instance.last_offer_id.call();
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;

  const pre = await getAllBalances(deployed, accounts, fund);
  const exchangePreEthToken = Number(
    await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
   );

  txId = await fund.instance.callOnExchange.postTransaction(
    {from: manager, gas: config.gas},
    [
      0, cancelOrderSignature,
      ['0x0', '0x0', '0x0', '0x0', '0x0'],
      [0, 0, 0, 0, 0, 0, 0, 0],
      `0x${Number(offerNumber).toString(16).padStart(64, '0')}`, 0, '0x0', '0x0'
    ]
  );

  const [orderId, ] = await fund.instance.getOpenOrderInfo.call(
    {}, [exchanges[0].address, mlnToken.address]
  );
  const orderOpen = await exchanges[0].instance.isActive.call({}, [orderId]);
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostEthToken = Number(
    await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.false(orderOpen);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken - trade1.sellQuantity);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.sellQuantity));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
  );
});

// redeeming after trading
const redemptions = [
  { amount: new BigNumber(10 ** 7) },
  { amount: new BigNumber(2 * 10 ** 7) },
];
redemptions.forEach((redemption, index) => {
  test.serial(
    `Allows redemption ${index + 1} (standard redemption method)`,
    async t => {
      let investorGasTotal = new BigNumber(0);
      const investorPreShares = await fund.instance.balanceOf.call({}, [
        investor,
      ]);
      const preTotalShares = await fund.instance.totalSupply.call({}, []);
      const sharePrice = await fund.instance.calcSharePrice.call({}, []);
      const wantedValue = Number(
        redemption.amount
          .times(sharePrice)
          .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
          .floor(),
      );
      const pre = await getAllBalances(deployed, accounts, fund);
      txId = await fund.instance.requestRedemption.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [redemption.amount, wantedValue, mlnToken.address],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      await updateCanonicalPriceFeed(deployed);
      await updateCanonicalPriceFeed(deployed);
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      txId = await fund.instance.executeRequest.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [requestId],
      );
      gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      // reduce remaining allowance to zero
      txId = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, 0],
      );
      gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const remainingApprovedMln = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address]),
      );
      const investorPostShares = await fund.instance.balanceOf.call({}, [
        investor,
      ]);
      const postTotalShares = await fund.instance.totalSupply.call({}, []);
      const post = await getAllBalances(deployed, accounts, fund);
      const [gav, , , unclaimedFees, ,] = Object.values(
        await fund.instance.atLastUnclaimedFeeAllocation.call({}, []),
      );
      const expectedFeesShares = parseInt(
        unclaimedFees
          .mul(preTotalShares)
          .div(gav)
          .toNumber(),
        0,
      );

      t.deepEqual(remainingApprovedMln, 0);
      t.deepEqual(
        postTotalShares,
        preTotalShares.minus(redemption.amount).plus(expectedFeesShares),
      );
      t.deepEqual(
        investorPostShares,
        investorPreShares.minus(redemption.amount),
      );
      t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
      t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
      t.deepEqual(
        post.investor.MlnToken,
        pre.investor.MlnToken.add(wantedValue),
      );
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.minus(wantedValue));
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );
});

test.serial(`Allows investment in native asset`, async t => {
  await fund.instance.enableInvestment.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [[ethToken.address]],
  );
  await fund.instance.enableRedemption.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [[ethToken.address]],
  );
  let investorGasTotal = new BigNumber(0);
  await ethToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, 10 ** 14, ""],
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  const investorPreShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const [
    ,
    invertedNativeAssetPrice,
    nativeAssetDecimal,
  ] = await pricefeed.instance.getInvertedPriceInfo.call({}, [ethToken.address]);
  const wantedShareQuantity = 10 ** 10;
  const giveQuantity = Number(
    new BigNumber(wantedShareQuantity)
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
      .times(invertedNativeAssetPrice)
      .dividedBy(new BigNumber(10 ** nativeAssetDecimal))
      .times(new BigNumber(1.2)) // For price fluctuations
      .floor(),
  );
  txId = await ethToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, giveQuantity],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed);
  txId = await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [giveQuantity, wantedShareQuantity, ethToken.address],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  txId = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);
  const investorPostShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );

  t.is(Number(investorPostShares), investorPreShares + wantedShareQuantity);
  t.true(post.investor.EthToken >= pre.investor.EthToken.minus(giveQuantity));
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.true(post.fund.EthToken <= pre.fund.EthToken.plus(giveQuantity));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(`Allows redemption in native asset`, async t => {
  let investorGasTotal = new BigNumber(0);
  const pre = await getAllBalances(deployed, accounts, fund);
  const investorPreShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );
  await updateCanonicalPriceFeed(deployed);
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const [
    ,
    invertedNativeAssetPrice,
    nativeAssetDecimal,
  ] = await pricefeed.instance.getInvertedPriceInfo.call({}, [ethToken.address]);
  const shareQuantity = 10 ** 3;
  const receiveQuantity = Number(
    new BigNumber(shareQuantity)
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
      .times(invertedNativeAssetPrice)
      .dividedBy(new BigNumber(10 ** nativeAssetDecimal))
      .times(new BigNumber(0.9)) // For price fluctuations
      .floor(),
  );
  txId = await fund.instance.requestRedemption.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [shareQuantity, receiveQuantity, ethToken.address],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  txId = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);
  const investorPostShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );

  t.is(Number(investorPostShares), investorPreShares - shareQuantity);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.true(post.investor.EthToken >= pre.investor.EthToken.plus(receiveQuantity));
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(
    post.fund.EthToken,
    pre.fund.EthToken.minus(post.investor.EthToken).plus(pre.investor.EthToken),
  );
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(`Allows redemption by tokenFallback method)`, async t => {
  const redemptionAmount = new BigNumber(120000000);
  let investorGasTotal = new BigNumber(0);
  const investorPreShares = await fund.instance.balanceOf.call({}, [investor]);
  const preTotalShares = await fund.instance.totalSupply.call({}, []);
  const pre = await getAllBalances(deployed, accounts, fund);
  txId = await fund.instance.transfer.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, redemptionAmount, ""],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const wantedValue = Number(
    redemptionAmount
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
      .floor(),
  );
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  txId = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  // reduce remaining allowance to zero
  txId = await mlnToken.instance.approve.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [fund.address, 0],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const remainingApprovedMln = Number(
    await mlnToken.instance.allowance.call({}, [investor, fund.address]),
  );
  const investorPostShares = await fund.instance.balanceOf.call({}, [investor]);
  const postTotalShares = await fund.instance.totalSupply.call({}, []);
  const post = await getAllBalances(deployed, accounts, fund);
  const [gav, , , unclaimedFees, ,] = Object.values(
    await fund.instance.atLastUnclaimedFeeAllocation.call({}, []),
  );
  const expectedFeesShares = parseInt(
    unclaimedFees
      .mul(preTotalShares)
      .div(gav)
      .toNumber(),
    0,
  );

  t.deepEqual(remainingApprovedMln, 0);
  t.deepEqual(
    postTotalShares,
    preTotalShares.minus(redemptionAmount).plus(expectedFeesShares),
  );
  t.deepEqual(investorPostShares, investorPreShares.minus(redemptionAmount));
  t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken.add(wantedValue));
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.minus(wantedValue));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// Fees
test.serial("converts fees and manager receives them", async t => {
  await updateCanonicalPriceFeed(deployed);
  const pre = await getAllBalances(deployed, accounts, fund);
  const preManagerShares = await fund.instance.balanceOf.call({}, [manager]);
  const totalSupply = await fund.instance.totalSupply.call({}, []);
  txId = await fund.instance.calcSharePriceAndAllocateFees.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [],
  );
  const [gav, , , unclaimedFees, ,] = Object.values(
    await fund.instance.atLastUnclaimedFeeAllocation.call({}, []),
  );
  const shareQuantity = Math.floor(
    Number(totalSupply.mul(unclaimedFees).div(gav)),
  );
  const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postManagerShares = await fund.instance.balanceOf.call({}, [manager]);
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(postManagerShares, preManagerShares.add(shareQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// shutdown fund
test.serial("manager can shut down a fund", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  txId = await version.instance.shutDownFund.postTransaction(
    { from: manager, gasPrice: config.gasPrice },
    [fund.address],
  );
  const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  const isShutDown = await fund.instance.isShutDown.call({}, []);
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);

  t.true(isShutDown);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
