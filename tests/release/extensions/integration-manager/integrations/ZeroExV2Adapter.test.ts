import { randomAddress } from '@enzymefinance/ethers';
import {
  createUnsignedZeroExV2Order,
  signZeroExV2Order,
  SpendAssetsHandleType,
  takeOrderSelector,
  zeroExV2TakeOrderArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import { createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployer,
    deployment,
    config,
  } = await deployProtocolFixture();

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.synthetix.susd, deployer),
  });

  return {
    accounts: remainingAccounts,
    deployer,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { integrationManager, zeroExV2Adapter },
      config: {
        zeroex: { allowedMakers, exchange },
      },
    } = await provider.snapshot(snapshot);

    const getExchangeCall = await zeroExV2Adapter.getExchange();
    expect(getExchangeCall).toMatchAddress(exchange);

    const getIntegrationManagerCall = await zeroExV2Adapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(integrationManager);

    for (const allowedMaker of allowedMakers) {
      const isAllowedMakerCall = await zeroExV2Adapter.isAllowedMaker(allowedMaker);
      expect(isAllowedMakerCall).toBe(true);
    }
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a maker which is not whitelisted', async () => {
    const {
      deployer,
      config: {
        weth,
        primitives: { mln },
        zeroex: { exchange },
      },
      deployment: { zeroExV2Adapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(weth, whales.weth);
    const incomingAsset = new StandardToken(mln, provider);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(11);

    const unsignedOrder = await createUnsignedZeroExV2Order({
      exchange: exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    await expect(zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs)).rejects.toBeRevertedWith(
      'Order maker is not allowed',
    );
  });

  it('generates expected output without takerFee', async () => {
    const {
      deployer,
      config: {
        weth,
        primitives: { mln },
        zeroex: { exchange },
      },
      deployment: { dispatcher, zeroExV2Adapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(weth, whales.weth);
    const incomingAsset = new StandardToken(mln, provider);

    const fundDeployerOwner = await dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(0);
    const takerAssetFillAmount = BigNumber.from(2);
    const expectedMinIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);

    const unsignedOrder = await createUnsignedZeroExV2Order({
      exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [takerAssetFillAmount],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    });
  });

  it('generates expected output with takerFeeAsset that is the same as makerAsset', async () => {
    const {
      deployer,
      config: {
        primitives: { mln, zrx },
        zeroex: { exchange },
      },
      deployment: { dispatcher, zeroExV2Adapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(mln, whales.mln);
    const incomingAsset = new StandardToken(zrx, provider);

    const fundDeployerOwner = await dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const takerFee = BigNumber.from(3);
    const makerAssetAmount = BigNumber.from(5);
    const takerAssetAmount = BigNumber.from(11);
    const takerAssetFillAmount = BigNumber.from(7);
    const expectedTakerFee = takerAssetFillAmount.mul(takerFee).div(takerAssetAmount);
    const expectedMinIncomingAssetAmount = makerAssetAmount
      .mul(takerAssetFillAmount)
      .div(takerAssetAmount)
      .sub(expectedTakerFee);

    const unsignedOrder = await createUnsignedZeroExV2Order({
      exchange: exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [takerAssetFillAmount],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    });
  });

  it('generates expected output with takerFeeAsset that is the same as takerAsset', async () => {
    const {
      deployer,
      config: {
        primitives: { mln, zrx },
        zeroex: { exchange },
      },
      deployment: { dispatcher, zeroExV2Adapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(zrx, whales.zrx);
    const incomingAsset = new StandardToken(mln, provider);

    const fundDeployerOwner = await dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(2);
    const expectedMinIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);
    const expectedTakerFee = takerAssetFillAmount.mul(takerFee).div(takerAssetAmount);

    const unsignedOrder = await createUnsignedZeroExV2Order({
      exchange: exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [takerAssetFillAmount.add(expectedTakerFee)],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    });
  });

  it('generates expected output with takerFee', async () => {
    const {
      deployer,
      config: {
        weth,
        primitives: { mln, zrx },
        zeroex: { exchange },
      },
      deployment: { dispatcher, zeroExV2Adapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(weth, whales.weth);
    const incomingAsset = new StandardToken(mln, provider);
    const takerFeeAsset = new StandardToken(zrx, provider);

    const fundDeployerOwner = await dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(2);
    const expectedMinIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);
    const expectedTakerFee = takerAssetFillAmount.mul(takerFee).div(takerAssetAmount);

    const unsignedOrder = await createUnsignedZeroExV2Order({
      exchange: exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset, takerFeeAsset],
      spendAssetAmounts_: [takerAssetFillAmount, expectedTakerFee],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    });
  });
});

describe('allowed makers', () => {
  describe('addAllowedMakers', () => {
    it('can only be called by fundDeployerOwner', async () => {
      const {
        deployment: { dispatcher, zeroExV2Adapter },
        fund: { fundOwner },
      } = await provider.snapshot(snapshot);

      const fundDeployerOwner = await dispatcher.getOwner();
      const makerAddress = randomAddress();
      const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

      await expect(adapter.connect(fundOwner).addAllowedMakers([makerAddress])).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow an already-set maker', async () => {
      const {
        deployment: { dispatcher, zeroExV2Adapter },
      } = await provider.snapshot(snapshot);

      const fundDeployerOwner = await dispatcher.getOwner();
      const makerAddress = randomAddress();
      const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

      await expect(adapter.addAllowedMakers([makerAddress, makerAddress])).rejects.toBeRevertedWith(
        'Value already set',
      );
    });

    it.todo('does not allow an empty _accountsToAdd param');

    it.todo('adds accounts to allowedMakers and emits the correct event per removed account');
  });

  describe('removeAllowedMakers', () => {
    it.todo('does not allow a random caller');

    it.todo('does not allow an empty _accountsToRemove param');

    it.todo('does not allow an input account that is not an allowed maker');

    it.todo('removes accounts from allowedMakers and emits the correct event per removed account');
  });
});
