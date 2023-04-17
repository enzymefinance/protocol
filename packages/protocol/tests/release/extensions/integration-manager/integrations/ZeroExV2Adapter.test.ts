import { randomAddress } from '@enzymefinance/ethers';
import {
  createUnsignedZeroExV2Order,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  signZeroExV2Order,
  SpendAssetsHandleType,
  takeOrderSelector,
  zeroExV2TakeOrderArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  setAccountBalance,
  zeroExV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

const erc20Proxy = '0x95e6f48254609a6ee006f7d493c8e5fb97094cef';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;

    const getExchangeCall = await zeroExV2Adapter.getZeroExV2Exchange();

    expect(getExchangeCall).toMatchAddress(fork.config.zeroexV2.exchange);

    const getIntegrationManagerCall = await zeroExV2Adapter.getIntegrationManager();

    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.integrationManager);

    for (const allowedMaker of fork.config.zeroexV2.allowedMakers) {
      const isAllowedMakerCall = await zeroExV2Adapter.isAllowedMaker(allowedMaker);

      expect(isAllowedMakerCall).toBe(true);
    }
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a maker which is not whitelisted', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const outgoingAsset = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(11);

    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress,
      maker: fork.deployer,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, fork.deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    await expect(
      zeroExV2Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs),
    ).rejects.toBeRevertedWith('Order maker is not allowed');
  });

  it('generates expected output without takerFee', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const deployer = fork.deployer;
    const outgoingAsset = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);

    const fundDeployerOwner = await fork.deployment.dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([fork.deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(0);
    const takerAssetFillAmount = BigNumber.from(2);
    const expectedMinIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);

    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress,
      maker: deployer,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetAmounts_: [takerAssetFillAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output with takerFeeAsset that is the same as makerAsset', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const deployer = fork.deployer;
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.zrx, provider);

    const fundDeployerOwner = await fork.deployment.dispatcher.getOwner();
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

    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress,
      maker: deployer,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetAmounts_: [takerAssetFillAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output with takerFeeAsset that is the same as takerAsset', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const deployer = fork.deployer;
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.zrx, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);

    const fundDeployerOwner = await fork.deployment.dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(2);
    const expectedMinIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);
    const expectedTakerFee = takerAssetFillAmount.mul(takerFee).div(takerAssetAmount);

    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress,
      maker: deployer,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetAmounts_: [takerAssetFillAmount.add(expectedTakerFee)],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output with takerFee', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const deployer = fork.deployer;
    const outgoingAsset = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);
    const takerFeeAsset = new ITestStandardToken(fork.config.primitives.zrx, provider);

    const fundDeployerOwner = await fork.deployment.dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = BigNumber.from(3);
    const takerAssetAmount = BigNumber.from(5);
    const takerFee = BigNumber.from(7);
    const takerAssetFillAmount = BigNumber.from(2);
    const expectedMinIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);
    const expectedTakerFee = takerAssetFillAmount.mul(takerFee).div(takerAssetAmount);

    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress,
      maker: deployer,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const takeOrderArgs = zeroExV2TakeOrderArgs({
      signedOrder,
      takerAssetFillAmount,
    });

    const result = await zeroExV2Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
      spendAssetAmounts_: [takerAssetFillAmount, expectedTakerFee],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset, takerFeeAsset],
    });
  });
});

describe('allowed makers', () => {
  describe('addAllowedMakers', () => {
    it('can only be called by fundDeployerOwner', async () => {
      const [fundOwner] = fork.accounts;
      const deployer = fork.deployer;
      const fundDeployerOwner = await fork.deployment.dispatcher.getOwner();
      const makerAddress = randomAddress();
      const adapter = fork.deployment.zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

      await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.synthetix.susd, deployer),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: deployer,
      });

      await expect(adapter.connect(fundOwner).addAllowedMakers([makerAddress])).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow an already-set maker', async () => {
      const fundDeployerOwner = await fork.deployment.dispatcher.getOwner();
      const makerAddress = randomAddress();
      const adapter = fork.deployment.zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

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

describe('takeOrder', () => {
  it('works as expected without takerFee', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const weth = new ITestStandardToken(fork.config.weth, provider);
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.dai, provider);
    const incomingAsset = weth;
    const [fundOwner, maker] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Add the maker to the allowed list of maker addresses
    await zeroExV2Adapter.addAllowedMakers([maker]);

    // Define the order params
    const makerAssetAmount = utils.parseEther('1');
    const takerAssetAmount = utils.parseEther('1');
    const takerAssetFillAmount = takerAssetAmount;

    // Seed the maker and create a 0x order
    await setAccountBalance({ provider, account: maker, amount: makerAssetAmount, token: incomingAsset });
    await incomingAsset.connect(maker).approve(erc20Proxy, makerAssetAmount);
    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress: constants.AddressZero,
      maker,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee: BigNumber.from(0),
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, maker);

    // Seed the fund
    await setAccountBalance({ provider, account: vaultProxy, amount: takerAssetAmount, token: outgoingAsset });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Take the 0x order
    await zeroExV2TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      signedOrder,
      takerAssetFillAmount,
      vaultProxy,
      zeroExV2Adapter: fork.deployment.zeroExV2Adapter,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    expect(incomingAssetAmount).toEqBigNumber(makerAssetAmount);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount));
  });

  it('works as expected with takerFee', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const denominationAsset = new ITestStandardToken(fork.config.weth, provider);
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.zrx, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.bat, provider);
    const [fundOwner, maker] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Add the maker to the allowed list of maker addresses
    await zeroExV2Adapter.addAllowedMakers([maker]);

    // Define the order params
    const makerAssetAmount = utils.parseEther('1');
    const takerAssetAmount = utils.parseEther('1');
    const takerFee = utils.parseEther('0.0001');
    const takerAssetFillAmount = utils.parseEther('1');

    // Seed the maker and create a 0x order
    await setAccountBalance({ provider, account: maker, amount: makerAssetAmount, token: incomingAsset });
    await incomingAsset.connect(maker).approve(erc20Proxy, makerAssetAmount);
    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress: randomAddress(),
      maker,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee,
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, maker);

    // Seed the fund
    await setAccountBalance({
      provider,
      account: vaultProxy,
      amount: takerFee.add(takerAssetAmount),
      token: outgoingAsset,
    });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Take the 0x order
    await zeroExV2TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      signedOrder,
      takerAssetFillAmount,
      vaultProxy,
      zeroExV2Adapter,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    expect(incomingAssetAmount).toEqBigNumber(makerAssetAmount);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount.add(takerFee)));
  });

  it('partially fill an order', async () => {
    const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
    const weth = new ITestStandardToken(fork.config.weth, provider);
    const outgoingAsset = weth;
    const incomingAsset = new ITestStandardToken(fork.config.primitives.bat, provider);
    const [fundOwner, maker] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Add the maker to the allowed list of maker addresses
    await zeroExV2Adapter.addAllowedMakers([maker]);

    // Define the order params
    const makerAssetAmount = utils.parseEther('1');
    const takerAssetAmount = utils.parseEther('0.1');
    const takerAssetFillAmount = utils.parseEther('0.03');
    const expectedIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);

    // Seed the maker and create a 0x order
    await setAccountBalance({ provider, account: maker, amount: makerAssetAmount, token: incomingAsset });
    await incomingAsset.connect(maker).approve(erc20Proxy, makerAssetAmount);
    const unsignedOrder = createUnsignedZeroExV2Order({
      exchange: fork.config.zeroexV2.exchange,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      feeRecipientAddress: constants.AddressZero,
      maker,
      makerAsset: incomingAsset,
      makerAssetAmount,
      takerAsset: outgoingAsset,
      takerAssetAmount,
      takerFee: BigNumber.from(0),
    });
    const signedOrder = await signZeroExV2Order(unsignedOrder, maker);

    // Seed the fund
    await setAccountBalance({ provider, account: vaultProxy, amount: takerAssetFillAmount, token: outgoingAsset });
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Take the 0x order
    await zeroExV2TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      signedOrder,
      takerAssetFillAmount,
      vaultProxy,
      zeroExV2Adapter,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    expect(incomingAssetAmount).toEqBigNumber(expectedIncomingAssetAmount);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount));
  });
});
