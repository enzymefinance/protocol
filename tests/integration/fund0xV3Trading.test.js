/*
 * @file Tests funds vault via the 0x adapter
 *
 * @test Fund takes an order made by a third party
 * @test Fund takes an order made by a third party, with a taker fee
 * @test Fund takes an order made by a third party, with same taker, taker fee, and protocol fee assets
 * @test Fund takes an order made by a third party, with no protocolFee set
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpDiv } from '~/utils/BNmath';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  signZeroExOrder
} from '~/utils/zeroExV3';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, governorTxOpts;
let zrx, mln, weth, priceSource, fundFactory, zeroExExchange, erc20ProxyAddress, fund, zeroExAdapter;
let takeOrderSignature;
let protocolFeeAmount, chainId;

const gasPrice = toWei('2', 'gwei');

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  governorTxOpts = { ...defaultTxOpts, from: mainnetAddrs.zeroExV3.ZeroExV3Governor };

  await web3.eth.sendTransaction({
    from: deployer,
    to: mainnetAddrs.zeroExV3.ZeroExV3Governor,
    value: toWei('1', 'ether'),
    gas: 1000000
  });

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.ZRX);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_ADAPTER);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_EXCHANGE_INTERFACE, mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

  erc20ProxyAddress = mainnetAddrs.zeroExV3.ZeroExV3ERC20Proxy;

  fund = await setupFundWithParams({
    integrationAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('5', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });

  // Set vars - orders
  const protocolFeeMultiplier = new BN(
    await call(zeroExExchange, 'protocolFeeMultiplier')
  );
  protocolFeeAmount = protocolFeeMultiplier.mul(new BN(gasPrice));
  chainId = await web3.eth.net.getId();
});

describe('Fund takes an order', () => {
  let signedOrder;
  let makerAssetAmount, takerAssetAmount;

  test('Third party makes an order', async () => {
    const makerTokenAddress = zrx.options.address;
    makerAssetAmount = toWei('1', 'Ether');
    const takerTokenAddress = weth.options.address;
    const makerPerTakerRate = new BN(
      (await call(priceSource, 'getLiveRate', [takerTokenAddress, makerTokenAddress]))[0]
    );
    takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      makerPerTakerRate
    ).toString();

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        makerAddress: deployer,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
      }
    );

    await send(zrx, 'approve', [erc20ProxyAddress, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);

    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Manager takes order through 0x adapter', async () => {
    const { vault } = fund;

    const preZrxDeployer = new BN(await call(zrx, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

    await send(
      vault,
      'callOnIntegration',
      [
        zeroExAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    );

    const postZrxDeployer = new BN(await call(zrx, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

    expect(postZrxDeployer).bigNumberEq(preZrxDeployer.sub(new BN(makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(takerAssetAmount)));

    const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
    const fundBalanceOfZrxDiff = postFundBalanceOfZrx.sub(preFundBalanceOfZrx);

    // Confirm that expected asset amounts were filled
    expect(fundBalanceOfWethDiff).bigNumberEq(
      new BN(takerAssetAmount).add(protocolFeeAmount)
    );
    expect(fundBalanceOfZrxDiff).bigNumberEq(new BN(makerAssetAmount));
  });
});

describe('Fund takes an order with a different taker fee asset', () => {
  let signedOrder;
  let makerAssetAmount, takerAssetAmount, takerFee;

  test('Third party makes an order', async () => {
    const makerTokenAddress = mln.options.address;
    makerAssetAmount = toWei('1', 'Ether');
    const takerTokenAddress = weth.options.address;
    const makerPerTakerRate = new BN(
      (await call(priceSource, 'getLiveRate', [takerTokenAddress, makerTokenAddress]))[0]
    );
    takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      makerPerTakerRate
    ).toString();
    const takerFeeTokenAddress = zrx.options.address;
    takerFee = new BN(toWei('1', 'ether'));

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        feeRecipientAddress: investor,
        makerAddress: deployer,
        makerTokenAddress,
        makerAssetAmount,
        takerFee,
        takerTokenAddress,
        takerAssetAmount,
        takerFeeTokenAddress
      }
    );

    await send(mln, 'approve', [erc20ProxyAddress, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Fund with enough taker fee asset takes order', async () => {
    const { vault } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

    await send(
      vault,
      'callOnIntegration',
      [
        zeroExAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    );


    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(takerAssetAmount)));

    const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
    const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);
    const fundBalanceOfZrxDiff = preFundBalanceOfZrx.sub(postFundBalanceOfZrx);

    // Confirm that expected asset amounts were filled
    expect(fundBalanceOfWethDiff).bigNumberEq(
      new BN(takerAssetAmount).add(protocolFeeAmount)
    );
    expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerAssetAmount));
    expect(fundBalanceOfZrxDiff).bigNumberEq(new BN(takerFee));
  });
});

describe('Fund takes an order with same taker, taker fee, and protocol fee asset', () => {
  let makerAssetAmount, takerAssetAmount, takerFee;
  let signedOrder;

  test('Third party makes an order', async () => {
    const makerTokenAddress = mln.options.address;
    makerAssetAmount = toWei('0.1', 'Ether');
    const takerTokenAddress = weth.options.address;
    const makerPerTakerRate = new BN(
      (await call(priceSource, 'getLiveRate', [takerTokenAddress, makerTokenAddress]))[0]
    );
    takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      makerPerTakerRate
    ).toString();
    const takerFeeTokenAddress = weth.options.address;
    takerFee = new BN(toWei('0.005', 'ether'));

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        feeRecipientAddress: investor,
        makerAddress: deployer,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
        takerFee,
        takerFeeTokenAddress
      }
    );

    await send(mln, 'approve', [erc20ProxyAddress, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Fund with enough taker fee asset and protocol fee takes order', async () => {
    const { vault } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

    await send(
      vault,
      'callOnIntegration',
      [
        zeroExAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(takerAssetAmount)));

    const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
    const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

    // Confirm that expected asset amounts were filled
    expect(fundBalanceOfWethDiff).bigNumberEq(
      new BN(takerAssetAmount)
        .add(protocolFeeAmount)
        .add(new BN(takerFee))
    );
    expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerAssetAmount));
  });
});

describe('Fund can take an order when protocol fee disabled', () => {
  let makerAssetAmount, takerAssetAmount;
  let signedOrder;

  // @dev Sets protocolFeeMultiplier to 0, so need to undo after if further tests
  test('Deployer sets protocolFeeMultiplier to 0', async () => {
    await send(zeroExExchange, 'setProtocolFeeMultiplier', [0], governorTxOpts);
    const newProtocolFeeMultiplier = await call(zeroExExchange, 'protocolFeeMultiplier');
    expect(newProtocolFeeMultiplier).toEqual("0");
  });

  test('Third party makes order', async () => {
    const makerTokenAddress = mln.options.address;
    makerAssetAmount = toWei('1', 'Ether');
    const takerTokenAddress = weth.options.address;
    const makerPerTakerRate = new BN(
      (await call(priceSource, 'getLiveRate', [takerTokenAddress, makerTokenAddress]))[0]
    );
    takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      makerPerTakerRate
    ).toString();

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        makerAddress: deployer,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
      }
    );

    await send(mln, 'approve', [erc20ProxyAddress, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);

    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Manager takes order through 0x adapter', async () => {
    const { vault } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

    await send(
      vault,
      'callOnIntegration',
      [
        zeroExAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(takerAssetAmount)));

    const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
    const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

    // Confirm that expected asset amounts were filled
    expect(fundBalanceOfWethDiff).bigNumberEq(new BN(takerAssetAmount));
    expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerAssetAmount));
  });
});
