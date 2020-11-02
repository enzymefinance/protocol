import { BigNumber, constants } from 'ethers';
import { AddressLike, EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import {
  createUnsignedZeroExV2Order,
  Dispatcher,
  signZeroExV2Order,
  takeOrderSelector,
  zeroExV2TakeOrderArgs,
} from '@melonproject/protocol';
import { defaultTestDeployment, createNewFund } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

async function getFundDeployerOwner(dispatcher: AddressLike, provider: EthereumTestnetProvider) {
  const dispatcherContract = new Dispatcher(dispatcher, provider);
  return dispatcherContract.getOwner();
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { integrationManager, zeroExV2Adapter },
      config: {
        integratees: { zeroExV2 },
      },
    } = await provider.snapshot(snapshot);

    const getExchangeCall = await zeroExV2Adapter.getExchange();
    expect(getExchangeCall).toMatchAddress(zeroExV2.exchange);

    const getIntegrationManagerCall = await zeroExV2Adapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(integrationManager);

    for (const allowedMaker of zeroExV2.allowedMakers) {
      const isAllowedMakerCall = await zeroExV2Adapter.isAllowedMaker(allowedMaker);
      expect(isAllowedMakerCall).toBe(true);
    }
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a maker which is not whitelisted', async () => {
    const {
      config: {
        deployer,
        integratees: { zeroExV2 },
      },
      deployment: {
        tokens: { mln: incomingAsset, weth: outgoingAsset },
        zeroExV2Adapter,
      },
    } = await provider.snapshot(snapshot);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(11);

    const unsignedOrder = await createUnsignedZeroExV2Order({
      provider,
      exchange: zeroExV2.exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
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
      config: {
        deployer,
        dispatcher,
        integratees: { zeroExV2 },
      },
      deployment: {
        tokens: { mln: incomingAsset, weth: outgoingAsset },
        zeroExV2Adapter,
      },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(0);
    const takerAssetFillAmount = BigNumber.from(2);
    const expectedMinIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);

    const unsignedOrder = await createUnsignedZeroExV2Order({
      provider,
      exchange: zeroExV2.exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod.fragment, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [takerAssetFillAmount],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
    });
  });

  it('generates expected output with takerFeeAsset that is the same as makerAsset', async () => {
    const {
      config: {
        deployer,
        dispatcher,
        integratees: { zeroExV2 },
      },
      deployment: {
        tokens: { zrx: incomingAsset, mln: outgoingAsset },
        zeroExV2Adapter,
      },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
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
      provider,
      exchange: zeroExV2.exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod.fragment, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [takerAssetFillAmount],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
    });
  });

  it('generates expected output with takerFeeAsset that is the same as takerAsset', async () => {
    const {
      config: {
        deployer,
        dispatcher,
        integratees: { zeroExV2 },
      },
      deployment: {
        tokens: { mln: incomingAsset, zrx: outgoingAsset },
        zeroExV2Adapter,
      },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
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
      provider,
      exchange: zeroExV2.exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod.fragment, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [takerAssetFillAmount.add(expectedTakerFee)],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
    });
  });

  it('generates expected output with takerFee', async () => {
    const {
      config: {
        deployer,
        dispatcher,
        integratees: { zeroExV2 },
      },
      deployment: {
        tokens: { mln: incomingAsset, weth: outgoingAsset, zrx: takerFeeAsset },
        zeroExV2Adapter,
      },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
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
      provider,
      exchange: zeroExV2.exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod.fragment, {
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset, takerFeeAsset],
      spendAssetAmounts_: [takerAssetFillAmount, expectedTakerFee],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
    });
  });
});

describe('allowed makers', () => {
  describe('addAllowedMakers', () => {
    it('can only be called by fundDeployerOwner', async () => {
      const {
        config: { dispatcher },
        deployment: { zeroExV2Adapter },
        fund: { fundOwner },
      } = await provider.snapshot(snapshot);

      const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
      const makerAddress = randomAddress();
      const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

      await expect(adapter.connect(fundOwner).addAllowedMakers([makerAddress])).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow an already-set maker', async () => {
      const {
        config: { dispatcher },
        deployment: { zeroExV2Adapter },
      } = await provider.snapshot(snapshot);

      const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
      const makerAddress = randomAddress();
      const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

      await expect(adapter.addAllowedMakers([makerAddress, makerAddress])).rejects.toBeRevertedWith(
        'Value already set',
      );

      it.todo('does not allow an empty _accountsToAdd param');

      it.todo('adds accounts to allowedMakers and emits the correct event per removed account');
    });
  });

  describe('removeAllowedMakers', () => {
    it.todo('does not allow a random caller');

    it.todo('does not allow an empty _accountsToRemove param');

    it.todo('does not allow an input account that is not an allowed maker');

    it.todo('removes accounts from allowedMakers and emits the correct event per removed account');
  });
});
