import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { constants, utils } from 'ethers';
import {
  StandardToken,
  IUniswapV2Factory,
  IUniswapV2Pair,
  BuySharesPriceFeedTolerance,
  ComptrollerLib,
  ValueInterpreter,
  VaultLib,
} from '@melonproject/protocol';
import {
  buySharesPriceFeedToleranceArgs,
  policyHooks,
  validateRulePreBuySharesArgs,
  assertEvent,
  defaultTestDeployment,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Mock tokens, with 1e18 balances everywhere
  const mockWeth = await StandardToken.mock(config.deployer);
  await mockWeth.balanceOf.returns(utils.parseEther('1'));
  const mockAsset = await StandardToken.mock(config.deployer);
  await mockAsset.balanceOf.returns(utils.parseEther('1'));

  // Mock the UniswapV2Pair, with 1e18 reserve balances
  const mockUniswapV2Pair = await IUniswapV2Pair.mock(config.deployer);
  await mockUniswapV2Pair.token0.returns(mockAsset);
  await mockUniswapV2Pair.getReserves.returns(
    utils.parseEther('1'),
    utils.parseEther('1'),
    0,
  );

  // Mock the UniswapV2Factory
  const mockUniswapV2Factory = await IUniswapV2Factory.mock(config.deployer);
  await mockUniswapV2Factory.getPair.returns(constants.AddressZero);
  await mockUniswapV2Factory.getPair
    .given(mockAsset, mockWeth)
    .returns(mockUniswapV2Pair);

  // Mock the ValueInterpreter
  const mockValueInterpreter = await ValueInterpreter.mock(config.deployer);
  await mockValueInterpreter.calcCanonicalAssetValue.returns(0, false);

  // Deploy the standalone policy
  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const standaloneBuySharesPriceFeedTolerance = await BuySharesPriceFeedTolerance.deploy(
    config.deployer,
    EOAPolicyManager,
    mockUniswapV2Factory,
    mockValueInterpreter,
    mockWeth,
  );

  // Mock the VaultProxy
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  // Mock the ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);
  await mockComptrollerProxy.getDenominationAsset.returns(mockWeth);

  // Add policy settings for ComptrollerProxy
  const policyConfig = await buySharesPriceFeedToleranceArgs(
    utils.parseEther('0.1'), // 10%
  );
  await standaloneBuySharesPriceFeedTolerance
    .connect(EOAPolicyManager)
    .addFundSettings(mockComptrollerProxy, policyConfig);

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    mockAsset,
    mockComptrollerProxy,
    mockUniswapV2Factory,
    mockUniswapV2Pair,
    mockValueInterpreter,
    mockVaultProxy,
    mockWeth,
    standaloneBuySharesPriceFeedTolerance: standaloneBuySharesPriceFeedTolerance.connect(
      EOAPolicyManager,
    ),
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        integratees: { uniswapV2 },
        weth,
      },
      deployment: {
        buySharesPriceFeedTolerance,
        policyManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const implementedHooksCall = buySharesPriceFeedTolerance.implementedHooks();
    await expect(implementedHooksCall).resolves.toMatchObject([
      policyHooks.PreBuyShares,
    ]);

    const getPolicyManagerCall = buySharesPriceFeedTolerance.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const getUniswapFactoryCall = buySharesPriceFeedTolerance.getUniswapFactory();
    await expect(getUniswapFactoryCall).resolves.toBe(uniswapV2.factory);

    const getValueInterpreterCall = buySharesPriceFeedTolerance.getValueInterpreter();
    await expect(getValueInterpreterCall).resolves.toBe(
      valueInterpreter.address,
    );

    const getWethTokenCall = buySharesPriceFeedTolerance.getWethToken();
    await expect(getWethTokenCall).resolves.toBe(weth);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      accounts: { 0: randomUser },
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    const policyConfig = await buySharesPriceFeedToleranceArgs(
      utils.parseEther('0.1'), // 10%
    );
    const addFundSettingsTx = policy
      .connect(randomUser)
      .addFundSettings(randomAddress(), policyConfig);

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('correctly handles a valid call', async () => {
    const {
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    const comptrollerProxyAddress = randomAddress();
    const tolerance = utils.parseEther('0.1'); // 10%
    const policyConfig = await buySharesPriceFeedToleranceArgs(tolerance);
    const addFundSettingsTx = policy.addFundSettings(
      comptrollerProxyAddress,
      policyConfig,
    );
    await expect(addFundSettingsTx).resolves.toBeReceipt();

    // List should be the whitelisted investors
    const getToleranceForFundCall = policy.getToleranceForFund(
      comptrollerProxyAddress,
    );
    await expect(getToleranceForFundCall).resolves.toEqBigNumber(tolerance);

    // Assert the ToleranceSetForFund event was emitted
    await assertEvent(addFundSettingsTx, 'ToleranceSetForFund', {
      comptrollerProxy: comptrollerProxyAddress,
      nextTolerance: tolerance,
    });
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('updateFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      accounts: { 0: randomUser },
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    const policyConfig = await buySharesPriceFeedToleranceArgs(
      utils.parseEther('0.05'), // 5%
    );
    const updateFundSettingsTx = policy
      .connect(randomUser)
      .updateFundSettings(mockComptrollerProxy, mockVaultProxy, policyConfig);

    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('correctly handles a valid call', async () => {
    const {
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    const nextTolerance = utils.parseEther('0.05'); // 5%
    const policyConfig = await buySharesPriceFeedToleranceArgs(nextTolerance);
    const updateFundSettingsTx = policy.updateFundSettings(
      mockComptrollerProxy,
      mockVaultProxy,
      policyConfig,
    );
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // List should be the whitelisted investors
    const getToleranceForFundCall = policy.getToleranceForFund(
      mockComptrollerProxy,
    );
    await expect(getToleranceForFundCall).resolves.toEqBigNumber(nextTolerance);

    // Assert the ToleranceSetForFund event was emitted
    await assertEvent(updateFundSettingsTx, 'ToleranceSetForFund', {
      comptrollerProxy: mockComptrollerProxy.address,
      nextTolerance,
    });
  });
});

describe('validateRule', () => {
  it('returns true if there are no tracked assets (i.e., first buy shares tx)', async () => {
    const {
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    const ruleArgs = await validateRulePreBuySharesArgs({ gav: 0 });

    // Policy should pass at the exact threshold
    const validateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBe(true);
  });

  it('respects exact threshold', async () => {
    const {
      mockAsset,
      mockComptrollerProxy,
      mockVaultProxy,
      mockUniswapV2Pair,
      mockWeth,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    // 2 tracked assets, including denomination asset
    await mockVaultProxy.getTrackedAssets.returns([
      mockWeth.address,
      mockAsset.address,
    ]);

    // Set gav to 2 assets x 1e18 for simple calcs
    const ruleArgs = await validateRulePreBuySharesArgs({
      gav: utils.parseEther('2'),
    });

    // Increase amount of weth in Uniswap pool to raise rate to threshold
    const thresholdAmount = utils.parseEther('1.2');
    await mockUniswapV2Pair.getReserves.returns(
      utils.parseEther('1'),
      thresholdAmount,
      0,
    );

    // Policy should pass at the exact threshold
    const goodValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(goodValidateRuleCall).resolves.toBe(true);

    // Increase amount of weth asset in Uniswap pool to raise rate just above the threshold
    await mockUniswapV2Pair.getReserves.returns(
      utils.parseEther('1'),
      thresholdAmount.add(1),
      0,
    );

    // Policy should fail above the threshold
    const badValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(badValidateRuleCall).resolves.toBe(false);
  });

  it('respects a threshold of 0', async () => {
    const {
      mockAsset,
      mockComptrollerProxy,
      mockUniswapV2Pair,
      mockVaultProxy,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    // Update mockComptrollerProxy to a threshold of 0
    const policyConfig = await buySharesPriceFeedToleranceArgs(0);
    await policy.updateFundSettings(
      mockComptrollerProxy,
      mockVaultProxy,
      policyConfig,
    );

    // 1 tracked asset, non-denomination
    await mockVaultProxy.getTrackedAssets.returns([mockAsset.address]);

    // Set gav to 1e18 for simple calcs
    const thresholdAmount = utils.parseEther('1');
    const ruleArgs = await validateRulePreBuySharesArgs({
      gav: thresholdAmount,
    });

    // Policy should pass at the exact threshold as rates are equal
    const goodValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(goodValidateRuleCall).resolves.toBe(true);

    // Increase amount of weth asset in Uniswap pool to raise rate just above the threshold
    await mockUniswapV2Pair.getReserves.returns(
      utils.parseEther('1'),
      thresholdAmount.add(1),
      0,
    );

    // Policy should fail above the threshold
    const badValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(badValidateRuleCall).resolves.toBe(false);
  });

  it('returns false if a Uniswap pair does not exist', async () => {
    const {
      mockAsset,
      mockComptrollerProxy,
      mockUniswapV2Factory,
      mockVaultProxy,
      mockWeth,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    // 1 tracked asset, non-denomination
    await mockVaultProxy.getTrackedAssets.returns([mockAsset.address]);

    // Set gav to 1e18 for simple calcs
    const ruleArgs = await validateRulePreBuySharesArgs({
      gav: utils.parseEther('1'),
    });

    // Policy should pass at well below threshold
    const goodValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(goodValidateRuleCall).resolves.toBe(true);

    // Remove the Uniswap pool
    await mockUniswapV2Factory.getPair
      .given(mockAsset, mockWeth)
      .returns(constants.AddressZero);

    // Policy should fail without a Uniswap pool for mockAsset
    const badValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(badValidateRuleCall).resolves.toBe(false);
  });

  it('correctly handles a non-weth denomination asset', async () => {
    const {
      mockAsset,
      mockComptrollerProxy,
      mockUniswapV2Pair,
      mockValueInterpreter,
      mockVaultProxy,
      mockWeth,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    // Change the denomination asset to mockAsset
    await mockComptrollerProxy.getDenominationAsset.returns(mockAsset);

    // 1 tracked asset, denomination
    await mockVaultProxy.getTrackedAssets.returns([mockAsset.address]);

    // Create an easy gav conversion that yields a wethGav of 1e18
    const gav = utils.parseEther('2');
    const wethGav = utils.parseEther('1');
    const ruleArgs = await validateRulePreBuySharesArgs({ gav });

    // Return an invalid wethGav rate at first
    await mockValueInterpreter.calcCanonicalAssetValue
      .given(mockAsset, gav, mockWeth)
      .returns(wethGav, false);

    // Increase amount of weth asset in Uniswap pool to raise rate to the exact threshold
    const thresholdAmount = utils.parseEther('1.1');
    await mockUniswapV2Pair.getReserves.returns(
      utils.parseEther('1'),
      thresholdAmount,
      0,
    );

    // Policy should fail while rate is invalid
    const badValidateRuleCall1 = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(badValidateRuleCall1).resolves.toBe(false);

    // Set a valid wethGav rate
    await mockValueInterpreter.calcCanonicalAssetValue
      .given(mockAsset, gav, mockWeth)
      .returns(wethGav, true);

    // Policy should pass at the exact threshold
    const goodValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(goodValidateRuleCall).resolves.toBe(true);

    // Increase amount of weth asset in Uniswap pool to raise rate just above the threshold
    await mockUniswapV2Pair.getReserves.returns(
      utils.parseEther('1'),
      thresholdAmount.add(1),
      0,
    );

    // Policy should fail above the threshold
    const badValidateRuleCall2 = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(badValidateRuleCall2).resolves.toBe(false);
  });

  // All the other tests assume token0 to be the asset, and token1 to be weth
  it('correctly handles case of token0 being weth', async () => {
    const {
      mockAsset,
      mockComptrollerProxy,
      mockUniswapV2Pair,
      mockVaultProxy,
      mockWeth,
      standaloneBuySharesPriceFeedTolerance: policy,
    } = await provider.snapshot(snapshot);

    // 1 tracked asset
    await mockVaultProxy.getTrackedAssets.returns([mockAsset.address]);

    // Set gav to 1e18 for simple calcs
    const ruleArgs = await validateRulePreBuySharesArgs({
      gav: utils.parseEther('1'),
    });

    // Swap Uniswap pair token positions
    await mockUniswapV2Pair.token0.returns(mockWeth);

    // Increase amount of weth in Uniswap pool to raise rate to threshold
    const thresholdAmount = utils.parseEther('1.1');
    await mockUniswapV2Pair.getReserves.returns(
      thresholdAmount,
      utils.parseEther('1'),
      0,
    );

    // Policy should pass at the exact threshold
    const goodValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(goodValidateRuleCall).resolves.toBe(true);

    // Increase amount of weth asset in Uniswap pool to raise rate just above the threshold
    await mockUniswapV2Pair.getReserves.returns(
      thresholdAmount.add(1),
      utils.parseEther('1'),
      0,
    );

    // Policy should fail above the threshold
    const badValidateRuleCall = policy.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PreBuyShares,
        ruleArgs,
      )
      .call();
    await expect(badValidateRuleCall).resolves.toBe(false);
  });
});
