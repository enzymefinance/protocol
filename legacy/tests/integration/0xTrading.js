import 'babel-polyfill';
import test from "ava";
import {
  assetDataUtils,
  orderHashUtils,
  signatureUtils,
  SignerType
} from "0x.js";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import getFundComponents from "../../utils/lib/getFundComponents";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateTestingPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import getChainTime from "../../utils/lib/getChainTime";
import governanceAction from "../../utils/lib/governanceAction";
import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
  makeOrderSignatureBytes,
  takeOrderSignatureBytes,
  cancelOrderSignatureBytes,
} from "../../utils/lib/data";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let mlnToken;
let zrxToken;
let zeroExExchange;
let erc20Proxy;
let fund;
let investor;
let manager;
let pricefeed;
let trade1;
let version;
let deployed;
let order;
let orderSignature;
let opts;

// mock data
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const offeredValue = new BigNumber(10 ** 18);
const wantedShares = new BigNumber(10 ** 18);

test.before(async t => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, ,] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  pricefeed = await deployed.TestingPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  zrxToken = await deployContract(
    "exchanges/thirdparty/0x/ZrxToken",
     opts 
  );
  zeroExExchange = await deployContract(
    "exchanges/thirdparty/0x/Exchange", opts
  );
  erc20Proxy = await deployContract(
    "exchanges/thirdparty/0x/ERC20Proxy", opts
  );
  deployed.ZeroExV2Adapter = await deployContract(
    "exchanges/ZeroExV2Adapter",
    opts
  );
  // TODO
  // await governanceAction(
  //   opts,
  //   deployed.Governance,
  //   deployed.CanonicalPriceFeed,
  //   "registerExchange",
  //   [
  //     zeroExExchange.options.address,
  //     deployed.ZeroExV2Adapter.options.address,
  //     false,
  //     [makeOrderSignature, takeOrderSignature, cancelOrderSignature]
  //   ]
  // );
  await erc20Proxy.methods.addAuthorizedAddress(zeroExExchange.options.address).send(opts);
  await zeroExExchange.methods.registerAssetProxy(erc20Proxy.options.address).send(opts);
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(zrxToken.options.address);
  await zeroExExchange.methods.changeZRXAssetData(zrxAssetData).send(opts);
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await deployed.FundFactory.methods.createComponents(
    'Test Fund', [zeroExExchange.options.address], [deployed.ZeroExV2Adapter.options.address], deployed.EthToken.options.address, [deployed.EthToken.options.address, deployed.MlnToken.options.address], [false], deployed.TestingPriceFeed.options.address
  ).send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.continueCreation().send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.setupFund().send({from: manager, gasPrice: config.gasPrice});
  const fundId = await deployed.FundFactory.methods.getLastFundId().call();
  const hubAddress = await deployed.FundFactory.methods.getFundById(fundId).call();
  fund = await getFundComponents(hubAddress);
  await Promise.all(Object.values(fund).map(async (component) => {
    await deployed.MockVersion.methods.setIsFund(component.options.address).send({from: manager});
  }));

  const priceTolerance = await deployContract('fund/risk-management/PriceTolerance', { from: manager, gas: config.gas, gasPrice: config.gasPrice }, [10])
  await t.notThrows(fund.policyManager.methods.register(makeOrderSignatureBytes, priceTolerance.options.address).send({ from: manager, gasPrice: config.gasPrice }));
  await t.notThrows(fund.policyManager.methods.register(takeOrderSignatureBytes, priceTolerance.options.address).send({ from: deployer, gasPrice: config.gasPrice }));
});

test.beforeEach(async () => {
  await updateTestingPriceFeed(deployed);
  const [, referencePrice] = Object.values(
    await pricefeed.methods
      .getReferencePriceInfo(mlnToken.options.address, ethToken.options.address)
      .call()
  );
  const sellQuantity1 = new BigNumber(10 ** 18);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(referencePrice)
      .dividedBy(new BigNumber(10 ** 18))
      .times(sellQuantity1)
  };
});

const initialTokenAmount = new BigNumber(10 ** 18);
test.serial("investor gets initial ethToken for testing)", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.methods
    .transfer(investor, initialTokenAmount.toFixed())
    .send({ from: deployer, gasPrice: config.gasPrice });
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.EthToken,
    new BigNumber(pre.investor.EthToken).add(initialTokenAmount)
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
  "fund receives ETH from investment, and gets ZRX from direct transfer",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.methods
      .approve(fund.participation.options.address, offeredValue.toFixed())
      .send({ from: investor, gasPrice: config.gasPrice, gas: config.gas });
    await fund.participation.methods.requestInvestment(offeredValue.toFixed(), wantedShares.toFixed(), ethToken.options.address)
      .send({ from: investor, gas: config.gas, gasPrice: config.gasPrice });
    await fund.participation.methods.executeRequest().send({from: investor, gas: 6000000, gasPrice: config.gasPrice});
    await zrxToken.methods
      .transfer(investor, initialTokenAmount.toFixed())
      .send({ from: deployer, gasPrice: config.gasPrice });
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(
      post.investor.EthToken,
      pre.investor.EthToken.minus(offeredValue.toFixed())
    );
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(offeredValue.toFixed()));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  }
);

test.serial("third party makes and validates an off-chain order", async t => {
  const makerAddress = deployer.toLowerCase();
  order = {
    exchangeAddress: zeroExExchange.options.address.toLowerCase(),
    makerAddress,
    takerAddress: NULL_ADDRESS,
    senderAddress: NULL_ADDRESS,
    feeRecipientAddress: NULL_ADDRESS,
    expirationTimeSeconds: new BigNumber(await getChainTime()).add(
      20000
    ),
    salt: new BigNumber(555),
    makerAssetAmount: new BigNumber(trade1.sellQuantity),
    takerAssetAmount: new BigNumber(trade1.buyQuantity),
    makerAssetData: assetDataUtils.encodeERC20AssetData(
      mlnToken.options.address.toLowerCase()
    ),
    takerAssetData: assetDataUtils.encodeERC20AssetData(
      ethToken.options.address.toLowerCase()
    ),
    makerFee: new BigNumber(0),
    takerFee: new BigNumber(0)
  };
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  orderSignature = await signatureUtils.ecSignOrderHashAsync(
    web3.currentProvider,
    orderHashHex,
    deployer,
    SignerType.Default
  );

  await mlnToken.methods
    .approve(erc20Proxy.options.address, trade1.sellQuantity.toFixed())
    .send({ from: deployer });

  const signatureValid = await signatureUtils.isValidSignatureAsync(
    web3.currentProvider,
    orderHashHex,
    orderSignature,
    makerAddress
  );

  t.true(signatureValid);
});

test.serial(
  "manager takes order (half the total quantity) through 0x adapter",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const fillQuantity = trade1.buyQuantity.div(2);
    await fund.trading.methods
      .callOnExchange(
        0,
        takeOrderSignature,
        [
          deployer,
          NULL_ADDRESS,
          mlnToken.options.address,
          ethToken.options.address,
          order.feeRecipientAddress,
          NULL_ADDRESS
        ],
        [
          order.makerAssetAmount.toFixed(),
          order.takerAssetAmount.toFixed(),
          order.makerFee.toFixed(),
          order.takerFee.toFixed(),
          order.expirationTimeSeconds.toFixed(),
          order.salt.toFixed(),
          fillQuantity.toFixed(),
          0
        ],
        web3.utils.padLeft("0x0", 64),
        order.makerAssetData,
        order.takerAssetData,
        orderSignature
      )
      .send({ from: manager, gas: config.gas });
    const post = await getAllBalances(deployed, accounts, fund);
    const heldInExchange = await fund.trading.methods
      .updateAndGetQuantityHeldInExchange(ethToken.options.address)
      .call();

    t.is(Number(heldInExchange), 0);
    t.deepEqual(
      post.deployer.MlnToken,
      pre.deployer.MlnToken.minus(trade1.sellQuantity.div(2))
    );
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(fillQuantity));
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(
      post.fund.MlnToken,
      pre.fund.MlnToken.add(trade1.sellQuantity.div(2))
    );
    t.deepEqual(
      post.deployer.EthToken,
      pre.deployer.EthToken.plus(fillQuantity)
    );
    t.deepEqual(post.fund.ether, pre.fund.ether);
  }
);

test.serial("third party makes another order with taker fees", async t => {
  const makerAddress = deployer.toLowerCase();
  const takerFee = new BigNumber(10 ** 17);
  order = {
    exchangeAddress: zeroExExchange.options.address.toLowerCase(),
    makerAddress,
    takerAddress: NULL_ADDRESS,
    senderAddress: NULL_ADDRESS,
    feeRecipientAddress: investor.toLowerCase(),
    expirationTimeSeconds: new BigNumber(await getChainTime()).add(
      20000
    ),
    salt: new BigNumber(555),
    makerAssetAmount: new BigNumber(trade1.sellQuantity),
    takerAssetAmount: new BigNumber(trade1.buyQuantity),
    makerAssetData: assetDataUtils.encodeERC20AssetData(
      mlnToken.options.address.toLowerCase()
    ),
    takerAssetData: assetDataUtils.encodeERC20AssetData(
      ethToken.options.address.toLowerCase()
    ),
    makerFee: new BigNumber(0),
    takerFee
  };
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  orderSignature = await signatureUtils.ecSignOrderHashAsync(
    web3.currentProvider,
    orderHashHex,
    deployer,
    SignerType.Default
  );
  await mlnToken.methods
    .approve(erc20Proxy.options.address, trade1.sellQuantity.toFixed())
    .send({ from: deployer });

  const signatureValid = await signatureUtils.isValidSignatureAsync(
    web3.currentProvider,
    orderHashHex,
    orderSignature,
    makerAddress
  );

  t.true(signatureValid);
});

test.serial("fund with enough ZRX takes the above order", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const fillQuantity = trade1.buyQuantity.div(2);
  await zrxToken.methods
    .transfer(fund.vault.options.address, new BigNumber(10 ** 17).toFixed())
    .send(opts);
  await fund.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        deployer,
        NULL_ADDRESS,
        mlnToken.options.address,
        ethToken.options.address,
        order.feeRecipientAddress,
        NULL_ADDRESS
      ],
      [
        order.makerAssetAmount.toFixed(),
        order.takerAssetAmount.toFixed(),
        order.makerFee.toFixed(),
        order.takerFee.toFixed(),
        order.expirationTimeSeconds.toFixed(),
        order.salt.toFixed(),
        fillQuantity.toFixed(),
        0
      ],
      web3.utils.padLeft("0x0", 64),
      order.makerAssetData,
      order.takerAssetData,
      orderSignature
    )
    .send({ from: manager, gas: config.gas });
  await fund.trading.methods.returnToVault([mlnToken.options.address, ethToken.options.address]).send(opts);
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.trading.methods
    .updateAndGetQuantityHeldInExchange(ethToken.options.address)
    .call();

  t.is(Number(heldInExchange), 0);
  t.deepEqual(
    post.deployer.MlnToken,
    pre.deployer.MlnToken.minus(trade1.sellQuantity.div(2))
  );
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(fillQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(
    post.fund.MlnToken,
    pre.fund.MlnToken.add(trade1.sellQuantity.div(2))
  );
  t.deepEqual(post.deployer.EthToken, pre.deployer.EthToken.plus(fillQuantity));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("Make order through the fund", async t => {
  const makerAddress = fund.trading.options.address.toLowerCase();
  order = {
    exchangeAddress: zeroExExchange.options.address.toLowerCase(),
    makerAddress,
    takerAddress: NULL_ADDRESS,
    senderAddress: NULL_ADDRESS,
    feeRecipientAddress: NULL_ADDRESS,
    expirationTimeSeconds: new BigNumber(await getChainTime()).add(
      20000
    ),
    salt: new BigNumber(555),
    makerAssetAmount: new BigNumber(trade1.sellQuantity),
    takerAssetAmount: new BigNumber(trade1.buyQuantity),
    makerAssetData: assetDataUtils.encodeERC20AssetData(
      mlnToken.options.address.toLowerCase()
    ),
    takerAssetData: assetDataUtils.encodeERC20AssetData(
      ethToken.options.address.toLowerCase()
    ),
    makerFee: new BigNumber(0),
    takerFee: new BigNumber(0)
  };
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  orderSignature = await signatureUtils.ecSignOrderHashAsync(
    web3.currentProvider,
    orderHashHex,
    manager,
    SignerType.Default
  );
  orderSignature = orderSignature.substring(0, orderSignature.length - 1) + "6";
  await fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        mlnToken.options.address,
        ethToken.options.address,
        order.feeRecipientAddress,
        NULL_ADDRESS
      ],
      [
        order.makerAssetAmount.toFixed(),
        order.takerAssetAmount.toFixed(),
        order.makerFee.toFixed(),
        order.takerFee.toFixed(),
        order.expirationTimeSeconds.toFixed(),
        order.salt.toFixed(),
        0,
        0
      ],
      web3.utils.padLeft("0x0", 64),
      order.makerAssetData,
      order.takerAssetData,
      orderSignature
    )
    .send({ from: manager, gas: config.gas });
  const makerAssetAllowance = new BigNumber(
    await mlnToken.methods
      .allowance(fund.trading.options.address, erc20Proxy.options.address)
      .call()
  );
  t.deepEqual(makerAssetAllowance, order.makerAssetAmount);
});

test.serial(
  "Fund cannot make multiple orders for same asset unless fulfilled",
  async t => {
    await t.throws(
      fund.trading.methods
        .callOnExchange(
          0,
          makeOrderSignature,
          [
            fund.trading.options.address.toLowerCase(),
            NULL_ADDRESS,
            mlnToken.options.address,
            ethToken.options.address,
            order.feeRecipientAddress,
            NULL_ADDRESS
          ],
          [
            order.makerAssetAmount.toFixed(),
            order.takerAssetAmount.toFixed(),
            order.makerFee.toFixed(),
            order.takerFee.toFixed(),
            order.expirationTimeSeconds.toFixed(),
            559,
            0,
            0
          ],
          web3.utils.padLeft("0x0", 64),
          order.makerAssetData,
          order.takerAssetData,
          orderSignature
        )
        .send({ from: manager, gas: config.gas })
    );
  }
);

test.serial("Third party fund takes the order made by the fund", async t => {
  await deployed.FundFactory.methods.createComponents(
    'Test Fund', [zeroExExchange.options.address], [deployed.ZeroExV2Adapter.options.address], deployed.EthToken.options.address, [deployed.EthToken.options.address, deployed.MlnToken.options.address], [false], deployed.TestingPriceFeed.options.address
  ).send({from: accounts[4], gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.continueCreation().send({from: accounts[4], gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.setupFund().send({from: accounts[4], gasPrice: config.gasPrice});
  const fundId = await deployed.FundFactory.methods.getLastFundId().call();
  const hubAddress = await deployed.FundFactory.methods.getFundById(fundId).call();
  const thirdPartyFund = await getFundComponents(hubAddress);
  await ethToken.methods
    .transfer(thirdPartyFund.vault.options.address, order.takerAssetAmount.toFixed())
    .send({from: deployer, gas: 8000000});
  const pre = await getAllBalances(deployed, accounts, fund);
  const preTPFundMln = new BigNumber(
    await mlnToken.methods.balanceOf(thirdPartyFund.vault.options.address).call()
  );
  const preTPFundEthToken = new BigNumber(
    await ethToken.methods.balanceOf(thirdPartyFund.vault.options.address).call()
  );
  await thirdPartyFund.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        fund.trading.options.address.toLowerCase(),
        NULL_ADDRESS,
        mlnToken.options.address,
        ethToken.options.address,
        order.feeRecipientAddress,
        NULL_ADDRESS
      ],
      [
        order.makerAssetAmount.toFixed(),
        order.takerAssetAmount.toFixed(),
        order.makerFee.toFixed(),
        order.takerFee.toFixed(),
        order.expirationTimeSeconds.toFixed(),
        order.salt.toFixed(),
        order.takerAssetAmount.toFixed(),
        0
      ],
      web3.utils.padLeft("0x0", 64),
      order.makerAssetData,
      order.takerAssetData,
      orderSignature
    )
    .send({ from: accounts[4], gas: config.gas, gasPrice: config.gasPrice });
  await thirdPartyFund.trading.methods.returnToVault([mlnToken.options.address, ethToken.options.address]).send(opts);
  const postTPFundMln = new BigNumber(
    await mlnToken.methods.balanceOf(thirdPartyFund.vault.options.address).call()
  );
  const postTPFundEthToken = new BigNumber(
    await ethToken.methods.balanceOf(thirdPartyFund.vault.options.address).call()
  );
  const post = await getAllBalances(deployed, accounts, fund);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.plus(trade1.buyQuantity));
  t.deepEqual(postTPFundEthToken, preTPFundEthToken.minus(trade1.buyQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.minus(trade1.sellQuantity));
  t.deepEqual(postTPFundMln, preTPFundMln.plus(trade1.sellQuantity));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(
  "Fund can make another make order for same asset (After it's inactive)",
  async t => {
    await mlnToken.methods
      .transfer(fund.vault.options.address, (new BigNumber(10 ** 20)).toFixed())
      .send(opts);
    const makerAddress = fund.trading.options.address.toLowerCase();
    order = {
      exchangeAddress: zeroExExchange.options.address.toLowerCase(),
      makerAddress,
      takerAddress: NULL_ADDRESS,
      senderAddress: NULL_ADDRESS,
      feeRecipientAddress: NULL_ADDRESS,
      expirationTimeSeconds: new BigNumber(await getChainTime()).add(
        20000
      ),
      salt: new BigNumber(585),
      makerAssetAmount: new BigNumber(trade1.sellQuantity),
      takerAssetAmount: new BigNumber(trade1.buyQuantity),
      makerAssetData: assetDataUtils.encodeERC20AssetData(
        mlnToken.options.address.toLowerCase()
      ),
      takerAssetData: assetDataUtils.encodeERC20AssetData(
        ethToken.options.address.toLowerCase()
      ),
      makerFee: new BigNumber(0),
      takerFee: new BigNumber(0)
    };
    const orderHashHex = orderHashUtils.getOrderHashHex(order);
    orderSignature = await signatureUtils.ecSignOrderHashAsync(
      web3.currentProvider,
      orderHashHex,
      manager,
      SignerType.Default
    );
    orderSignature =
      orderSignature.substring(0, orderSignature.length - 1) + "6";
    await fund.trading.methods
      .callOnExchange(
        0,
        makeOrderSignature,
        [
          makerAddress,
          NULL_ADDRESS,
          mlnToken.options.address,
          ethToken.options.address,
          order.feeRecipientAddress,
          NULL_ADDRESS
        ],
        [
          order.makerAssetAmount.toFixed(),
          order.takerAssetAmount.toFixed(),
          order.makerFee.toFixed(),
          order.takerFee.toFixed(),
          order.expirationTimeSeconds.toFixed(),
          order.salt.toFixed(),
          0,
          0
        ],
        web3.utils.padLeft("0x0", 64),
        order.makerAssetData,
        order.takerAssetData,
        orderSignature
      )
      .send({ from: manager, gas: config.gas });
    const makerAssetAllowance = new BigNumber(
      await mlnToken.methods
        .allowance(fund.trading.options.address, erc20Proxy.options.address)
        .call()
    );
    t.deepEqual(makerAssetAllowance, order.makerAssetAmount);
  }
);

test.serial(
  "Fund can cancel the order using just the orderId",
  async t => {
    const orderHashHex = orderHashUtils.getOrderHashHex(order);
    await fund.trading.methods
      .callOnExchange(
        0,
        cancelOrderSignature,
        [
          NULL_ADDRESS,
          NULL_ADDRESS,
          NULL_ADDRESS,
          NULL_ADDRESS,
          NULL_ADDRESS,
          NULL_ADDRESS
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        orderHashHex,
        "0x0",
        "0x0",
        "0x0"
      )
      .send({ from: manager, gas: config.gas });
    const isOrderCancelled = await zeroExExchange.methods.cancelled(orderHashHex).call();
    const makerAssetAllowance = new BigNumber(
      await mlnToken.methods
        .allowance(fund.trading.options.address, erc20Proxy.options.address)
        .call()
    );
    t.true(isOrderCancelled);
    t.deepEqual(makerAssetAllowance, new BigNumber(0));
  }
);