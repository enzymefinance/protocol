import { BigNumber, constants } from 'ethers';
import {
  AddressLike,
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { Dispatcher } from '@melonproject/protocol';
import {
  defaultTestDeployment,
  createNewFund,
  takeOrderSelector,
  createUnsignedZeroExV2Order,
  signZeroExV2Order,
  zeroExV2TakeOrderArgs,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
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

async function getFundDeployerOwner(
  dispatcher: AddressLike,
  provider: EthereumTestnetProvider,
) {
  const dispatcherContract = new Dispatcher(
    await resolveAddress(dispatcher),
    provider,
  );

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

    const getExchangeCall = zeroExV2Adapter.getExchange();
    await expect(getExchangeCall).resolves.toBe(zeroExV2.exchange);

    const getIntegrationManagerCall = zeroExV2Adapter.getIntegrationManager();
    await expect(getIntegrationManagerCall).resolves.toBe(
      integrationManager.address,
    );
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
    const takeOrderArgs = await zeroExV2TakeOrderArgs(
      signedOrder,
      takerAssetFillAmount,
    );

    const parseAssetsForMethodCall = zeroExV2Adapter.parseAssetsForMethod(
      takeOrderSelector,
      takeOrderArgs,
    );
    await expect(parseAssetsForMethodCall).rejects.toBeRevertedWith(
      'maker is not allowed',
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
    const adapter = zeroExV2Adapter.connect(
      provider.getSigner(fundDeployerOwner),
    );

    const makerAddress = await resolveAddress(deployer);
    const updateAllowedMakersTx = adapter.updateAllowedMakers(
      [makerAddress],
      [true],
    );
    await expect(updateAllowedMakersTx).resolves.toBeReceipt();

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(0);
    const takerAssetFillAmount = BigNumber.from(11);
    const expectedMinIncomingAssetAmount = makerAssetAmount
      .mul(takerAssetFillAmount)
      .div(takerAssetAmount);

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
    const takeOrderArgs = await zeroExV2TakeOrderArgs(
      signedOrder,
      takerAssetFillAmount,
    );

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await zeroExV2Adapter.parseAssetsForMethod(
      takeOrderSelector,
      takeOrderArgs,
    );

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      incomingAssets_: [incomingAsset.address],
      spendAssets_: [outgoingAsset.address],
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
    const adapter = zeroExV2Adapter.connect(
      provider.getSigner(fundDeployerOwner),
    );

    const makerAddress = await resolveAddress(deployer);
    const updateAllowedMakersTx = adapter.updateAllowedMakers(
      [makerAddress],
      [true],
    );
    await expect(updateAllowedMakersTx).resolves.toBeReceipt();

    const feeRecipientAddress = constants.AddressZero;
    const takerFee = BigNumber.from(3);
    const makerAssetAmount = BigNumber.from(5);
    const takerAssetAmount = BigNumber.from(11);
    const takerAssetFillAmount = BigNumber.from(7);
    const expectedTakerFee = takerAssetFillAmount
      .mul(takerFee)
      .div(takerAssetAmount);
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
    const takeOrderArgs = await zeroExV2TakeOrderArgs(
      signedOrder,
      takerAssetFillAmount,
    );

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await zeroExV2Adapter.parseAssetsForMethod(
      takeOrderSelector,
      takeOrderArgs,
    );

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      incomingAssets_: [incomingAsset.address],
      spendAssets_: [outgoingAsset.address],
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
    const adapter = zeroExV2Adapter.connect(
      provider.getSigner(fundDeployerOwner),
    );

    const makerAddress = await resolveAddress(deployer);
    const updateAllowedMakersTx = adapter.updateAllowedMakers(
      [makerAddress],
      [true],
    );
    await expect(updateAllowedMakersTx).resolves.toBeReceipt();

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(11);
    const expectedMinIncomingAssetAmount = makerAssetAmount
      .mul(takerAssetFillAmount)
      .div(takerAssetAmount);
    const expectedTakerFee = takerAssetFillAmount
      .mul(takerFee)
      .div(takerAssetAmount);

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
    const takeOrderArgs = await zeroExV2TakeOrderArgs(
      signedOrder,
      takerAssetFillAmount,
    );

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await zeroExV2Adapter.parseAssetsForMethod(
      takeOrderSelector,
      takeOrderArgs,
    );

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      incomingAssets_: [incomingAsset.address],
      spendAssets_: [outgoingAsset.address],
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
    const adapter = zeroExV2Adapter.connect(
      provider.getSigner(fundDeployerOwner),
    );

    const makerAddress = await resolveAddress(deployer);
    const updateAllowedMakersTx = adapter.updateAllowedMakers(
      [makerAddress],
      [true],
    );
    await expect(updateAllowedMakersTx).resolves.toBeReceipt();

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(11);
    const expectedMinIncomingAssetAmount = makerAssetAmount
      .mul(takerAssetFillAmount)
      .div(takerAssetAmount);
    const expectedTakerFee = takerAssetFillAmount
      .mul(takerFee)
      .div(takerAssetAmount);

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
    const takeOrderArgs = await zeroExV2TakeOrderArgs(
      signedOrder,
      takerAssetFillAmount,
    );

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await zeroExV2Adapter.parseAssetsForMethod(
      takeOrderSelector,
      takeOrderArgs,
    );

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      incomingAssets_: [incomingAsset.address],
      spendAssets_: [outgoingAsset.address, takerFeeAsset.address],
      spendAssetAmounts_: [takerAssetFillAmount, expectedTakerFee],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
    });
  });
});

describe('updateAllowedMakers', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const {
      config: { dispatcher },
      deployment: { zeroExV2Adapter },
      fund: { fundOwner },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const makerAddress = randomAddress();
    const adapter = zeroExV2Adapter.connect(
      provider.getSigner(fundDeployerOwner),
    );

    const failUpdateAllowedMakersTx = adapter
      .connect(fundOwner)
      .updateAllowedMakers([makerAddress], [true]);
    await expect(failUpdateAllowedMakersTx).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );

    const updateAllowedMakersTx = adapter.updateAllowedMakers(
      [makerAddress],
      [true],
    );
    await expect(updateAllowedMakersTx).resolves.toBeReceipt();

    const isAllowedMakerCall = zeroExV2Adapter.isAllowedMaker(makerAddress);
    await expect(isAllowedMakerCall).resolves.toBe(true);
  });

  it('does not allow makers and alloweds arrays to have unequal length', async () => {
    const {
      config: { dispatcher },
      deployment: { zeroExV2Adapter },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const makerAddress = randomAddress();
    const adapter = zeroExV2Adapter.connect(
      provider.getSigner(fundDeployerOwner),
    );

    const updateAllowedMakersTx = adapter.updateAllowedMakers(
      [makerAddress, makerAddress],
      [true],
    );
    await expect(updateAllowedMakersTx).rejects.toBeRevertedWith(
      '_makers and _alloweds arrays unequal',
    );
  });

  it('does not allow a duplicate maker', async () => {
    const {
      config: { dispatcher },
      deployment: { zeroExV2Adapter },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const makerAddress = randomAddress();
    const adapter = zeroExV2Adapter.connect(
      provider.getSigner(fundDeployerOwner),
    );

    const updateAllowedMakersTx = adapter.updateAllowedMakers(
      [makerAddress, makerAddress],
      [true, true],
    );
    await expect(updateAllowedMakersTx).rejects.toBeRevertedWith(
      'duplicate maker detected',
    );
  });
});
