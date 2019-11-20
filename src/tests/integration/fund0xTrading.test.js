import { BN, randomHex, toWei } from 'web3-utils';
import { orderHashUtils } from '@0x/order-utils';
import { AssetProxyId } from '@0x/types';

import { Contracts, Exchanges } from '~/Contracts';
import { deployAndGetSystem } from '~/tests/utils/deployAndGetSystem';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
} from '~/utils/constants/orderSignatures';
import { getContract } from '~/utils/solidity/getContract';

import { getUpdatedTestPrices } from '../utils/new/api';
import { stringToBytes } from '../utils/new/formatting';
import { EMPTY_ADDRESS } from '../utils/new/constants';
import {
  createUnsignedZeroExOrder,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '../utils/new/zeroEx';


describe('fund-0x-trading', () => {
  let environment;
  let deployer, manager, investor;
  let defaultTxOpts, managerTxOpts, investorTxOpts;
  let addresses, contracts;
  let erc20ProxyAddress, zeroExConfigs;
  let signedOrder1, signedOrder2, signedOrder3, signedOrder4;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    const accounts = await environment.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const system = await deployAndGetSystem(environment);
    addresses = system.addresses;
    contracts = system.contracts;
    zeroExConfigs = addresses.exchangeConfigs[Exchanges.ZeroEx];

    const {
      mln,
      priceSource,
      version: fundFactory,
      weth,
      zeroExExchange,
      zrx
    } = contracts;

    const fundName = stringToBytes('Test fund', 32);
    await fundFactory.methods
      .beginSetup(
        fundName,
        [],
        [],
        [],
        [zeroExConfigs.exchange.toString()],
        [zeroExConfigs.adapter.toString()],
        weth.options.address.toString(),
        [
          mln.options.address.toString(),
          weth.options.address.toString()
        ]
      )
      .send(managerTxOpts);
    await fundFactory.methods.createAccounting().send(managerTxOpts);
    await fundFactory.methods.createFeeManager().send(managerTxOpts);
    await fundFactory.methods.createParticipation().send(managerTxOpts);
    await fundFactory.methods.createPolicyManager().send(managerTxOpts);
    await fundFactory.methods.createShares().send(managerTxOpts);
    await fundFactory.methods.createTrading().send(managerTxOpts);
    await fundFactory.methods.createVault().send(managerTxOpts);
    const res = await fundFactory.methods.completeSetup().send(managerTxOpts);
    const hubAddress = res.events.NewFund.returnValues.hub;
    const hub = getContract(environment, Contracts.Hub, hubAddress);
    const routes = await hub.methods.routes().call();
    contracts.fund = {
      accounting: getContract(
        environment,
        Contracts.Accounting,
        routes.accounting,
      ),
      participation: getContract(
        environment,
        Contracts.Participation,
        routes.participation,
      ),
      trading: getContract(environment, Contracts.Trading, routes.trading),
    };
    addresses.fund = routes;

    erc20ProxyAddress = await zeroExExchange.methods
      .getAssetProxy(AssetProxyId.ERC20.toString())
      .call();

    const prices = await getUpdatedTestPrices();
    await priceSource.methods
      .update(
        Object.keys(prices).map(key => contracts[key].options.address),
        Object.values(prices)
      )
      .send(defaultTxOpts);

    // Seed investor and fund with ETH and ZRX
    await weth.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);
    const { participation } = contracts.fund;
    const offeredValue = toWei('1', 'ether');
    const wantedShares = toWei('1', 'ether');
    const amguAmount = toWei('.01', 'ether');
    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);
    await participation.methods
      .requestInvestment(
        offeredValue,
        wantedShares,
        weth.options.address,
      )
      .send({ ...investorTxOpts, value: amguAmount });
    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);
    await zrx.methods
      .transfer(addresses.fund.vault, toWei('10', 'ether'))
      .send(defaultTxOpts);

  });

  test('third party makes and validates an off-chain order', async () => {
    const { mln, weth } = contracts;

    const makerAddress = deployer;
    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      environment,
      zeroExConfigs.exchange,
      {
        makerAddress,
        makerTokenAddress: mln.options.address,
        makerAssetAmount,
        takerTokenAddress: weth.options.address,
        takerAssetAmount,
      },
    );

    await mln.methods
      .approve(erc20ProxyAddress, makerAssetAmount)
      .send(defaultTxOpts);

    signedOrder1 = await signZeroExOrder(environment, unsignedOrder, deployer);
    const signatureValid = await isValidZeroExSignatureOffChain(
      environment,
      unsignedOrder,
      signedOrder1.signature,
      deployer
    );

    expect(signatureValid).toBeTruthy();
  });

  test('manager takes order through 0x adapter', async () => {
    const { mln, weth } = contracts;
    const { trading } = contracts.fund;
    const fillQuantity = signedOrder1.takerAssetAmount;

    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnFund = await mln.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const preWethDeployer = await weth.methods.balanceOf(deployer).call();
    const preWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();

    await trading.methods
      .callOnExchange(
        0,
        takeOrderSignature,
        [
          deployer,
          EMPTY_ADDRESS,
          mln.options.address,
          weth.options.address,
          signedOrder1.feeRecipientAddress,
          EMPTY_ADDRESS,
        ],
        [
          signedOrder1.makerAssetAmount,
          signedOrder1.takerAssetAmount,
          signedOrder1.makerFee,
          signedOrder1.takerFee,
          signedOrder1.expirationTimeSeconds,
          signedOrder1.salt,
          fillQuantity,
          0,
        ],
        randomHex(20),
        signedOrder1.makerAssetData,
        signedOrder1.takerAssetData,
        signedOrder1.signature,
      )
      .send(managerTxOpts);

    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnFund = await mln.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const postWethDeployer = await weth.methods.balanceOf(deployer).call();
    const postWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const heldInExchange = await trading.methods
      .updateAndGetQuantityHeldInExchange(weth.options.address)
      .call();

    expect(heldInExchange).toBe('0');
    expect(
      new BN(postMlnDeployer).eq(
        new BN(preMlnDeployer).sub(new BN(signedOrder1.makerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postWethFund).eq(
        new BN(preWethFund).sub(new BN(signedOrder1.takerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postMlnFund).eq(
        new BN(preMlnFund).add(new BN(signedOrder1.makerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postWethDeployer).eq(
        new BN(preWethDeployer).add(new BN(signedOrder1.takerAssetAmount))
      )
    ).toBe(true);
  });

  test('third party makes and validates an off-chain order', async () => {
    const { mln, weth } = contracts;

    const makerAddress = deployer;
    const takerFee = new BN(toWei('0.0001', 'ether'));

    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      environment,
      zeroExConfigs.exchange,
      {
        feeRecipientAddress: investor,
        makerAddress,
        makerTokenAddress: mln.options.address,
        makerAssetAmount,
        takerFee,
        takerTokenAddress: weth.options.address,
        takerAssetAmount,
      },
    );

    await mln.methods
      .approve(erc20ProxyAddress, makerAssetAmount)
      .send(defaultTxOpts);

    signedOrder2 = await signZeroExOrder(environment, unsignedOrder, deployer);
    const signatureValid = await isValidZeroExSignatureOffChain(
      environment,
      unsignedOrder,
      signedOrder2.signature,
      deployer
    );

    expect(signatureValid).toBeTruthy();
  });

  test('fund with enough ZRX takes the above order', async () => {
    const { mln, weth, zrx } = contracts;
    const { trading } = contracts.fund;
    const fillQuantity = signedOrder2.takerAssetAmount;

    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnFund = await mln.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const preWethDeployer = await weth.methods.balanceOf(deployer).call();
    const preWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const preZrxFund = await zrx.methods
      .balanceOf(addresses.fund.vault)
      .call();

    await trading.methods
      .callOnExchange(
        0,
        takeOrderSignature,
        [
          deployer,
          EMPTY_ADDRESS,
          mln.options.address,
          weth.options.address,
          signedOrder2.feeRecipientAddress,
          EMPTY_ADDRESS,
        ],
        [
          signedOrder2.makerAssetAmount,
          signedOrder2.takerAssetAmount,
          signedOrder2.makerFee,
          signedOrder2.takerFee,
          signedOrder2.expirationTimeSeconds,
          signedOrder2.salt,
          fillQuantity,
          0,
        ],
        randomHex(20),
        signedOrder2.makerAssetData,
        signedOrder2.takerAssetData,
        signedOrder2.signature,
      )
      .send(managerTxOpts);

    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnFund = await mln.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const postWethDeployer = await weth.methods.balanceOf(deployer).call();
    const postWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const postZrxFund = await zrx.methods
      .balanceOf(addresses.fund.vault)
      .call();

    const heldInExchange = await trading.methods
      .updateAndGetQuantityHeldInExchange(weth.options.address)
      .call();

    expect(heldInExchange).toBe('0');
    expect(
      new BN(postMlnDeployer).eq(
        new BN(preMlnDeployer).sub(new BN(signedOrder2.makerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postWethFund).eq(
        new BN(preWethFund).sub(new BN(signedOrder2.takerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postMlnFund).eq(
        new BN(preMlnFund).add(new BN(signedOrder2.makerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postWethDeployer).eq(
        new BN(preWethDeployer).add(new BN(signedOrder2.takerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postZrxFund).eq(
        new BN(preZrxFund).sub(new BN(signedOrder2.takerFee))
      )
    ).toBe(true);
  });

  test('Make order through the fund', async () => {
    const { mln, weth } = contracts;
    const { trading } = contracts.fund;

    const makerAddress = trading.options.address;
    const makerAssetAmount = toWei('0.5', 'ether');
    const takerAssetAmount = toWei('0.05', 'ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      environment,
      zeroExConfigs.exchange,
      {
        makerAddress,
        makerTokenAddress: mln.options.address,
        makerAssetAmount,
        takerTokenAddress: weth.options.address,
        takerAssetAmount,
      },
    );
    signedOrder3 = await signZeroExOrder(environment, unsignedOrder, manager);
    await trading.methods
      .callOnExchange(
        0,
        makeOrderSignature,
        [
          makerAddress,
          EMPTY_ADDRESS,
          mln.options.address,
          weth.options.address,
          signedOrder3.feeRecipientAddress,
          EMPTY_ADDRESS,
        ],
        [
          signedOrder3.makerAssetAmount,
          signedOrder3.takerAssetAmount,
          signedOrder3.makerFee,
          signedOrder3.takerFee,
          signedOrder3.expirationTimeSeconds,
          signedOrder3.salt,
          0,
          0,
        ],
        randomHex(20),
        signedOrder3.makerAssetData,
        signedOrder3.takerAssetData,
        signedOrder3.signature,
      )
      .send(managerTxOpts);
    const makerAssetAllowance = await mln.methods
      .allowance(
        trading.options.address,
        erc20ProxyAddress,
      )
      .call();
    expect(
      new BN(makerAssetAllowance).eq(new BN(signedOrder3.makerAssetAmount))
    ).toBe(true);
  });

  // test.serial(
  //   'Fund cannot make multiple orders for same asset unless fulfilled',
  //   async t => {
  //     await t.throws(
  //       fund.trading.methods
  //         .callOnExchange(
  //           0,
  //           makeOrderSignature,
  //           [
  //             fund.trading.options.address,
  //             EMPTY_ADDRESS,
  //             mlnToken.options.address,
  //             ethToken.options.address,
  //             order.feeRecipientAddress,
  //             EMPTY_ADDRESS,
  //           ],
  //           [
  //             order.makerAssetAmount.toFixed(),
  //             order.takerAssetAmount.toFixed(),
  //             order.makerFee.toFixed(),
  //             order.takerFee.toFixed(),
  //             order.expirationTimeSeconds.toFixed(),
  //             559,
  //             0,
  //             0,
  //           ],
  //           web3.utils.padLeft('0x0', 64),
  //           order.makerAssetData,
  //           order.takerAssetData,
  //           orderSignature,
  //         )
  //         .send({ from: manager, gas: config.gas }),
  //     );
  //   },
  // );

  test('Third party takes the order made by the fund', async () => {
    const { mln, weth, zeroExExchange } = contracts;
    const { accounting } = contracts.fund;

    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call()
    const preWethDeployer = await weth.methods.balanceOf(deployer).call();
    const preWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call()

    await weth.methods
      .approve(erc20ProxyAddress, signedOrder3.takerAssetAmount)
      .send(defaultTxOpts);

    const res = await zeroExExchange.methods
      .fillOrder(
        signedOrder3,
        signedOrder3.takerAssetAmount,
        signedOrder3.signature
      )
      .send(defaultTxOpts)

    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call()
    const postWethDeployer = await weth.methods.balanceOf(deployer).call();
    const postWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call()

    expect(
      new BN(postMlnFundHoldings).eq(
        new BN(preMlnFundHoldings).sub(new BN(signedOrder3.makerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postWethFundHoldings).eq(
        new BN(preWethFundHoldings).add(new BN(signedOrder3.takerAssetAmount))
      )
    ).toBe(true);

    expect(
      new BN(postMlnDeployer).eq(
        new BN(preMlnDeployer).add(new BN(signedOrder3.makerAssetAmount))
      )
    ).toBe(true);
    expect(
      new BN(postWethDeployer).eq(
        new BN(preWethDeployer).sub(new BN(signedOrder3.takerAssetAmount))
      )
    ).toBe(true);
  });

  // tslint:disable-next-line:max-line-length
  test("Fund can make another make order for same asset (After it's inactive)", async () => {
    const { mln, weth } = contracts;
    const { trading } = contracts.fund;

    const makerAddress = trading.options.address;
    const makerAssetAmount = toWei('0.05', 'Ether');
    const takerAssetAmount = toWei('0.5', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      environment,
      zeroExConfigs.exchange,
      {
        makerAddress,
        makerTokenAddress: weth.options.address,
        makerAssetAmount,
        takerTokenAddress: mln.options.address,
        takerAssetAmount,
      },
    );

    signedOrder4 = await signZeroExOrder(environment, unsignedOrder, manager);
    await trading.methods
      .callOnExchange(
        0,
        makeOrderSignature,
        [
          makerAddress,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          signedOrder4.feeRecipientAddress,
          EMPTY_ADDRESS,
        ],
        [
          signedOrder4.makerAssetAmount,
          signedOrder4.takerAssetAmount,
          signedOrder4.makerFee,
          signedOrder4.takerFee,
          signedOrder4.expirationTimeSeconds,
          signedOrder4.salt,
          0,
          0,
        ],
        randomHex(20),
        signedOrder4.makerAssetData,
        signedOrder4.takerAssetData,
        signedOrder4.signature,
      )
      .send(managerTxOpts);

    const makerAssetAllowance = await weth.methods
        .allowance(
          trading.options.address,
          erc20ProxyAddress,
        )
        .call();
    expect(
      new BN(makerAssetAllowance).eq(new BN(signedOrder4.makerAssetAmount))
    ).toBe(true);
  });

   test('Fund can cancel the order using just the orderId', async () => {
    const { mln, weth, zeroExExchange } = contracts;
    const { trading } = contracts.fund;

     const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder4);
     await trading.methods
       .callOnExchange(
         0,
         cancelOrderSignature,
         [
           EMPTY_ADDRESS,
           EMPTY_ADDRESS,
           EMPTY_ADDRESS,
           EMPTY_ADDRESS,
           EMPTY_ADDRESS,
           EMPTY_ADDRESS,
         ],
         [0, 0, 0, 0, 0, 0, 0, 0],
         orderHashHex,
         '0x0',
         '0x0',
         '0x0',
       )
       .send(managerTxOpts);
     const isOrderCancelled = await zeroExExchange.methods
       .cancelled(orderHashHex)
       .call();

     const makerAssetAllowance = await mln.methods
       .allowance(
         trading.options.address,
         erc20ProxyAddress,
       )
       .call();

     expect(new BN(makerAssetAllowance).eq(new BN(0))).toBe(true);
     expect(isOrderCancelled).toBeTruthy();
   });

  test('Expired order is removed from open maker order', async () => {
    const { mln, weth, zeroExExchange } = contracts;
    const { trading } = contracts.fund;

    // Increment next block time and mine block
    environment.eth.currentProvider.send(
      {
        id: 123,
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [1800], // 30 mins
      },
      (err, res) => {},
    );
    environment.eth.currentProvider.send(
      {
        id: 124,
        jsonrpc: '2.0',
        method: 'evm_mine',
      },
      (err, res) => {},
    );

    const makerAddress = trading.options.address;
    const makerAssetAmount = toWei('0.05', 'Ether');
    const takerAssetAmount = toWei('0.5', 'Ether');
    const duration = 50;

    const unsignedOrder = await createUnsignedZeroExOrder(
      environment,
      zeroExConfigs.exchange,
      {
        duration,
        makerAddress,
        makerTokenAddress: weth.options.address,
        makerAssetAmount,
        takerTokenAddress: mln.options.address,
        takerAssetAmount,
      },
    );
    const signedOrder5 = await signZeroExOrder(environment, unsignedOrder, manager);
    await trading.methods
      .callOnExchange(
        0,
        makeOrderSignature,
        [
          makerAddress,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          signedOrder5.feeRecipientAddress,
          EMPTY_ADDRESS,
        ],
        [
          signedOrder5.makerAssetAmount,
          signedOrder5.takerAssetAmount,
          signedOrder5.makerFee,
          signedOrder5.takerFee,
          signedOrder5.expirationTimeSeconds,
          signedOrder5.salt,
          0,
          0,
        ],
        randomHex(20),
        signedOrder5.makerAssetData,
        signedOrder5.takerAssetData,
        signedOrder5.signature,
      )
      .send(managerTxOpts);
    const makerAssetAllowance = await weth.methods
      .allowance(
        trading.options.address,
        erc20ProxyAddress,
      )
      .call();

    expect(
      new BN(makerAssetAllowance).eq(new BN(signedOrder5.makerAssetAmount))
    ).toBe(true);

    const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder5);
    await trading.methods
      .callOnExchange(
        0,
        cancelOrderSignature,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        orderHashHex,
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);
    await trading.methods
      .updateAndGetQuantityBeingTraded(weth.options.address)
      .send(managerTxOpts);
    const isInOpenMakeOrder = await trading.methods
      .isInOpenMakeOrder(weth.options.address)
      .call();

    expect(isInOpenMakeOrder).toBeFalsy();
  });
});
