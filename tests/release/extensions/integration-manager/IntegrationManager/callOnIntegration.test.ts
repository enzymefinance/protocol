import { randomAddress } from '@enzymefinance/ethers';
import {
  callOnIntegrationArgs,
  encodeArgs,
  IntegrationManagerActionId,
  MockGenericAdapter,
  MockGenericIntegratee,
  PolicyHook,
  sighash,
  StandardToken,
  validateRulePostCoIArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  mockGenericSwap,
  mockGenericSwapArgs,
  mockGenericSwapASelector,
  mockGenericSwapDirectFromVaultSelector,
  seedAccount,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const bat = new StandardToken(config.primitives.bat, provider);
  const dai = new StandardToken(config.primitives.dai, provider);
  const mln = new StandardToken(config.primitives.mln, provider);
  const weth = new WETH(config.weth, provider);

  const mockGenericIntegratee = await MockGenericIntegratee.deploy(deployer);
  const mockGenericAdapter = await MockGenericAdapter.deploy(deployer, mockGenericIntegratee);

  await Promise.all([
    seedAccount({ provider, account: mockGenericIntegratee, amount: utils.parseEther('1000'), token: bat }),
    seedAccount({ provider, account: mockGenericIntegratee, amount: utils.parseEther('1000'), token: dai }),
    seedAccount({ provider, account: mockGenericIntegratee, amount: utils.parseEther('1000'), token: mln }),
    seedAccount({ provider, account: mockGenericIntegratee, amount: utils.parseEther('1000'), token: weth }),
  ]);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: weth,
    fundDeployer: deployment.fundDeployer,
    fundOwner,
    signer: deployer,
  });

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fund: {
      comptrollerProxy,
      denominationAsset: weth,
      fundOwner,
      vaultProxy,
    },
    mockGenericAdapter,
    mockGenericIntegratee,
    tokens: { bat, dai, mln, weth },
  };
}

describe('callOnIntegration', () => {
  it('only allows the owner and asset managers', async () => {
    const {
      accounts: [newAssetManager],
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      mockGenericAdapter,
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({});

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      encodedCallArgs: swapArgs,
      selector: mockGenericSwapASelector,
    });

    // Call should be allowed by the fund owner
    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).resolves.toBeReceipt();

    // Call not allowed by the yet-to-be added asset manager
    await expect(
      comptrollerProxy
        .connect(newAssetManager)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Unauthorized');

    // Set the new asset manager
    await vaultProxy.connect(fundOwner).addAssetManagers([newAssetManager]);

    // Call should be allowed for the asset manager
    await expect(
      comptrollerProxy
        .connect(newAssetManager)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).resolves.toBeReceipt();
  });

  it('does not allow spendAssets and actualSpendAssetAmounts arrays to have unequal lengths', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln: incomingAsset, weth, dai },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      actualIncomingAssetAmounts: [utils.parseEther('1')],
      actualSpendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset],
      spendAssets: [weth, dai],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      encodedCallArgs: swapArgs,
      selector: mockGenericSwapASelector,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Spend assets arrays unequal');
  });

  it('does not allow incomingAssets and incomingAssetAmounts arrays to have unequal lengths', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln: spendAsset, weth, dai },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      actualIncomingAssetAmounts: [utils.parseEther('1')],
      actualSpendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [weth, dai],
      spendAssets: [spendAsset],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      encodedCallArgs: swapArgs,
      selector: mockGenericSwapASelector,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Incoming assets arrays unequal');
  });

  it('does not allow duplicate spend assets', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln: spendAsset, weth: incomingAsset },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      actualIncomingAssetAmounts: [utils.parseEther('1')],
      actualSpendAssetAmounts: Array(2).fill(utils.parseEther('1')),
      incomingAssets: [incomingAsset],
      spendAssets: [spendAsset, spendAsset],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      encodedCallArgs: swapArgs,
      selector: mockGenericSwapASelector,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Duplicate spend asset');
  });

  it('does not allow duplicate incoming assets', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln: spendAsset, weth: incomingAsset },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      actualIncomingAssetAmounts: Array(2).fill(utils.parseEther('1')),
      actualSpendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset, incomingAsset],
      spendAssets: [spendAsset],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      encodedCallArgs: swapArgs,
      selector: mockGenericSwapASelector,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Duplicate incoming asset');
  });

  it('does not allow a non-receivable incoming asset', async () => {
    const {
      mockGenericAdapter,
      tokens: { weth: spendAsset },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const nonReceivableToken = new StandardToken(randomAddress(), provider);

    await expect(
      mockGenericSwap({
        provider,
        actualSpendAssetAmounts: [utils.parseEther('1')],
        comptrollerProxy,
        signer: fundOwner,
        incomingAssets: [nonReceivableToken],
        integrationManager,
        minIncomingAssetAmounts: [utils.parseEther('1')],
        mockGenericAdapter,
        spendAssets: [spendAsset],
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');
  });

  it('does not allow spendAsset spent to be greater than expected', async () => {
    const {
      mockGenericAdapter,
      mockGenericIntegratee,
      tokens: { weth: spendAsset },
      deployment: { integrationManager, fundDeployer },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const maxSpendAssetAmount = utils.parseEther('1');
    const actualSpendAssetAmount = maxSpendAssetAmount.add(1);

    await seedAccount({ provider, account: vaultProxy, amount: actualSpendAssetAmount, token: spendAsset });

    // Approve the adapter's integratee to directly use a VaultProxy's balance of the spendAsset,
    // by registering the token's approve() function for use in vaultCallOnContract()
    const approveSelector = sighash(spendAsset.approve.fragment);

    await fundDeployer.registerVaultCalls(
      [spendAsset],
      [approveSelector],
      [utils.keccak256(encodeArgs(['address', 'uint'], [mockGenericIntegratee, actualSpendAssetAmount]))],
    );
    await comptrollerProxy
      .connect(fundOwner)
      .vaultCallOnContract(
        spendAsset,
        approveSelector,
        encodeArgs(['address', 'uint256'], [mockGenericIntegratee, actualSpendAssetAmount]),
      );

    await expect(
      mockGenericSwap({
        provider,
        actualSpendAssetAmounts: [actualSpendAssetAmount],
        comptrollerProxy,
        signer: fundOwner,
        integrationManager,
        maxSpendAssetAmounts: [maxSpendAssetAmount],
        mockGenericAdapter,
        selector: mockGenericSwapDirectFromVaultSelector,
        spendAssets: [spendAsset],
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Spent amount greater than expected');
  });

  it('does not allow incomingAsset received to be less than expected', async () => {
    const {
      mockGenericAdapter,
      tokens: { weth: spendAsset, mln: incomingAsset },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    await expect(
      mockGenericSwap({
        provider,
        actualIncomingAssetAmounts: [utils.parseEther('1')],
        actualSpendAssetAmounts: [utils.parseEther('1')],
        comptrollerProxy,
        signer: fundOwner,
        incomingAssets: [incomingAsset],
        integrationManager,
        minIncomingAssetAmounts: [utils.parseEther('2')],
        mockGenericAdapter,
        seedFund: true,
        spendAssets: [spendAsset],
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Received incoming asset less than expected');
  });
});

describe('valid calls', () => {
  it('handles multiple incoming assets and multiple spend assets', async () => {
    const {
      tokens: { bat, dai, mln, weth },
      mockGenericAdapter,
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets = [bat, dai];
    const actualSpendAssetAmounts = Array(2).fill(utils.parseEther('1'));
    const incomingAssets = [mln, weth];
    const actualIncomingAssetAmounts = [utils.parseEther('1'), utils.parseEther('2')];
    const minIncomingAssetAmounts = Array(2).fill(utils.parseEther('1'));

    const swapArgs = {
      actualIncomingAssetAmounts,
      actualSpendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      spendAssets,
    };

    const receipt = await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      seedFund: true,
      vaultProxy,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      caller: fundOwner,
      comptrollerProxy,
      incomingAssetAmounts: actualIncomingAssetAmounts,
      incomingAssets,
      integrationData,
      selector: mockGenericSwapASelector,
      spendAssetAmounts: actualSpendAssetAmounts,
      spendAssets,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        caller: fundOwner,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        incomingAssets,
        selector: mockGenericSwapASelector,
        spendAssetAmounts: actualSpendAssetAmounts,
        spendAssets,
      }),
    );

    const spendAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });

    expect(spendAssetBalancesCall).toEqual([utils.parseEther('0'), utils.parseEther('0')]);

    const incomingAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });

    expect(incomingAssetBalancesCall).toEqual(actualIncomingAssetAmounts);
  });

  it('handles untracked incoming asset with a non-zero starting balance', async () => {
    const {
      mockGenericAdapter,
      tokens: { bat },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const seedFundAmount = utils.parseEther('1');
    await seedAccount({ provider, account: vaultProxy, amount: seedFundAmount, token: bat });

    const spendAssets: [] = [];
    const actualSpendAssetAmounts: [] = [];
    const incomingAssets = [bat];
    const actualIncomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    // If an asset is untracked with balanceA in the vault, and an adapter action adds amountB to the vault,
    // then the actual amount accrued in the tx is amountB, even though the GAV has increased by balanceA + amountB.
    const expectedIncomingAssetAmount = actualIncomingAssetAmounts[0];

    const preTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();

    expect(preTxGetTrackedAssetsCall).toEqual([denominationAsset.address]);

    const swapArgs = { actualIncomingAssetAmounts, incomingAssets, minIncomingAssetAmounts };

    const receipt = await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      vaultProxy,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      caller: fundOwner,
      comptrollerProxy,
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      incomingAssets,
      integrationData,
      selector: mockGenericSwapASelector,
      spendAssetAmounts: actualSpendAssetAmounts,
      spendAssets,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        caller: fundOwner,
        incomingAssetAmounts: [expectedIncomingAssetAmount],
        incomingAssets,
        selector: mockGenericSwapASelector,
        spendAssetAmounts: actualSpendAssetAmounts,
        spendAssets,
      }),
    );

    const incomingAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });

    expect(incomingAssetBalancesCall).toEqual([expectedIncomingAssetAmount.add(seedFundAmount)]);
    const postTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();

    expect(postTxGetTrackedAssetsCall).toEqual([
      denominationAsset.address,
      ...incomingAssets.map((token) => token.address),
    ]);
  });

  it('handles untracked incoming asset with a zero starting balance', async () => {
    const {
      mockGenericAdapter,
      tokens: { bat },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets: [] = [];
    const actualSpendAssetAmounts: [] = [];
    const incomingAssets = [bat];
    const actualIncomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    const preTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();

    expect(preTxGetTrackedAssetsCall).toEqual([denominationAsset.address]);

    const swapArgs = { actualIncomingAssetAmounts, incomingAssets, minIncomingAssetAmounts };

    const receipt = await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      vaultProxy,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      caller: fundOwner,
      comptrollerProxy,
      incomingAssetAmounts: actualIncomingAssetAmounts,
      incomingAssets,
      integrationData,
      selector: mockGenericSwapASelector,
      spendAssetAmounts: actualSpendAssetAmounts,
      spendAssets,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        caller: fundOwner,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        incomingAssets,
        selector: mockGenericSwapASelector,
        spendAssetAmounts: actualSpendAssetAmounts,
        spendAssets,
      }),
    );

    const incomingAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });

    expect(incomingAssetBalancesCall).toEqual(actualIncomingAssetAmounts);
    const postTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();

    expect(postTxGetTrackedAssetsCall).toEqual([
      denominationAsset.address,
      ...incomingAssets.map((token) => token.address),
    ]);
  });

  it('handles a spend asset that is also an incoming asset and increases', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets = [mln];
    const actualSpendAssetAmounts = [utils.parseEther('1')];
    const incomingAssets = [mln];
    const actualIncomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    // If an asset spends amountA and receives amountB of the same asset, then the incoming amount is amountB - amountA.
    // The spend amount is 0.
    const expectedSpendAssetAmounts = [0];
    const expectedIncomingAssetAmounts = [actualIncomingAssetAmounts[0].sub(actualSpendAssetAmounts[0])];

    const swapArgs = {
      actualIncomingAssetAmounts,
      actualSpendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      spendAssets,
    };

    const receipt = await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      seedFund: true,
      vaultProxy,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    // Though the spend amount is 0, we still expect this to be reported in the event, as 0 values are not filtered out
    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      caller: fundOwner,
      comptrollerProxy,
      incomingAssetAmounts: expectedIncomingAssetAmounts,
      incomingAssets,
      integrationData,
      selector: mockGenericSwapASelector,
      spendAssetAmounts: expectedSpendAssetAmounts,
      spendAssets,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        caller: fundOwner,
        incomingAssetAmounts: expectedIncomingAssetAmounts,
        incomingAssets,
        selector: mockGenericSwapASelector,
        spendAssetAmounts: expectedSpendAssetAmounts,
        spendAssets,
      }),
    );

    const spendAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });

    expect(spendAssetBalancesCall).toEqual(actualIncomingAssetAmounts);
  });

  it('handles a spend asset that is not an incoming asset and increases', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssetAmountOnAdapter = BigNumber.from(5);

    await seedAccount({ provider, account: mockGenericAdapter, amount: spendAssetAmountOnAdapter, token: mln });

    const spendAssets = [mln];
    const actualSpendAssetAmounts = [BigNumber.from(1)];

    const swapArgs = {
      actualSpendAssetAmounts,
      spendAssets,
    };

    const receipt = await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      seedFund: true,
      vaultProxy,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    // Unless specified as an incoming asset, a spend asset that increases in balance will simply
    // show as a spend amount with a 0 balance
    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      caller: fundOwner,
      comptrollerProxy,
      incomingAssetAmounts: [],
      incomingAssets: [],
      integrationData,
      selector: mockGenericSwapASelector,
      spendAssetAmounts: [0],
      spendAssets,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        caller: fundOwner,
        incomingAssetAmounts: [],
        incomingAssets: [],
        selector: mockGenericSwapASelector,
        spendAssetAmounts: [0],
        spendAssets,
      }),
    );

    const spendAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });

    expect(spendAssetBalancesCall).toEqual([spendAssetAmountOnAdapter]);
  });

  it('handles a spend asset that is entirely transferred to the adapter, but partially used', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln: spendAsset },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssetAmount = utils.parseEther('1');
    const spendAssetRebate = utils.parseEther('0.1');

    // Seed and track the spend asset in the VaultProxy
    await addNewAssetsToFund({
      provider,
      amounts: [spendAssetAmount],
      assets: [spendAsset],
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
    });

    // Seed the adapter with the spend asset amount to refund
    await seedAccount({ provider, account: mockGenericAdapter, amount: spendAssetRebate, token: spendAsset });

    // Define spend assets and actual incoming assets
    const spendAssets = [spendAsset];
    const actualSpendAssetAmounts = [spendAssetAmount];
    const spendAssetAmounts = [spendAssetAmount.sub(spendAssetRebate)];

    // Swap the spend assets and receive the rebate
    const receipt = await mockGenericSwap({
      provider,
      actualSpendAssetAmounts,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      spendAssets,
      vaultProxy,
    });

    // Assert that the rebated amount was received and that the spend asset is still tracked
    expect(await spendAsset.balanceOf(vaultProxy)).toEqual(spendAssetRebate);
    expect(await vaultProxy.isTrackedAsset(spendAsset)).toBe(true);

    // Assert event emitted correctly
    assertEvent(receipt, integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund'), {
      adapter: mockGenericAdapter,
      caller: fundOwner,
      comptrollerProxy,
      incomingAssetAmounts: [],
      incomingAssets: [],
      integrationData: mockGenericSwapArgs({
        actualSpendAssetAmounts,
        spendAssets,
      }),
      selector: mockGenericSwapASelector,
      spendAssetAmounts,
      spendAssets,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        caller: fundOwner,
        incomingAssetAmounts: [],
        incomingAssets: [],
        selector: mockGenericSwapASelector,
        spendAssetAmounts,
        spendAssets,
      }),
    );
  });

  it('handles empty spend assets and incoming assets', async () => {
    const {
      mockGenericAdapter,
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets: [] = [];
    const actualSpendAssetAmounts: [] = [];
    const incomingAssets: [] = [];
    const actualIncomingAssetAmounts: [] = [];

    const swapArgs = { actualIncomingAssetAmounts, actualSpendAssetAmounts, incomingAssets, spendAssets };

    const receipt = await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      vaultProxy,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      caller: fundOwner,
      comptrollerProxy,
      incomingAssetAmounts: actualIncomingAssetAmounts,
      incomingAssets,
      integrationData,
      selector: mockGenericSwapASelector,
      spendAssetAmounts: actualSpendAssetAmounts,
      spendAssets,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        caller: fundOwner,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        incomingAssets,
        selector: mockGenericSwapASelector,
        spendAssetAmounts: actualSpendAssetAmounts,
        spendAssets,
      }),
    );
  });

  it('tracks an untracked incoming asset but does not set it as permanently tracked', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    expect(await vaultProxy.isTrackedAsset(mln)).toBe(false);

    await mockGenericSwap({
      provider,
      actualIncomingAssetAmounts: [1],
      comptrollerProxy,
      signer: fundOwner,
      incomingAssets: [mln],
      integrationManager,
      mockGenericAdapter,
      vaultProxy,
    });

    expect(await vaultProxy.isTrackedAsset(mln)).toBe(true);
  });
});

describe('SpendAssetsHandleType', () => {
  it.todo('does not approve or transfer a spend asset if type is `None`');

  it.todo('approves adapter with spend asset allowance if type is `Approve`');

  it.todo('transfers spend asset to adapter if type is `Transfer`');
});
