import { BigNumber, BigNumberish, constants, Signer, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import {
  assertEvent,
  defaultTestDeployment,
  callOnIntegrationArgs,
  createNewFund,
  getAssetBalances,
  integrationManagerActionIds,
  mockGenericSwap,
  mockGenericSwapArgs,
  mockGenericSwapASelector,
  policyHooks,
  validateRulePostCoIArgs,
  validateRulePreCoIArgs,
} from '@melonproject/testutils';
import {
  MockGenericAdapter,
  StandardToken,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      vaultProxy,
    },
  };
}

async function seedFundByTrading({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  mockGenericAdapter,
  incomingAsset,
  incomingAssetAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  mockGenericAdapter: MockGenericAdapter;
  incomingAsset: StandardToken;
  incomingAssetAmount: BigNumberish;
}) {
  const preTxAssetBalancesCall = getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset],
  });
  await expect(preTxAssetBalancesCall).resolves.toEqual([
    utils.parseEther('0'),
  ]);
  const preTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
  await expect(preTxGetTrackedAssetsCall).resolves.toEqual([]);

  const swapTx = mockGenericSwap({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    mockGenericAdapter,
    spendAssets: [],
    spendAssetAmounts: [],
    incomingAssets: [incomingAsset],
    minIncomingAssetAmounts: [BigNumber.from(1)],
    actualIncomingAssetAmounts: [incomingAssetAmount],
    seedFund: true,
  });

  const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
    'CallOnIntegrationExecutedForFund',
  );

  await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
    adapter: mockGenericAdapter.address,
    comptrollerProxy: comptrollerProxy.address,
    caller: await fundOwner.getAddress(),
    incomingAssets: [incomingAsset.address],
    incomingAssetAmounts: [incomingAssetAmount],
    outgoingAssets: [],
    outgoingAssetAmounts: [],
    selector: mockGenericSwapASelector,
    vaultProxy: vaultProxy.address,
  });

  const postTxAssetBalancesCall = getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset],
  });
  await expect(postTxAssetBalancesCall).resolves.toEqual([incomingAssetAmount]);
  const postTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
  await expect(postTxGetTrackedAssetsCall).resolves.toEqual([
    incomingAsset.address,
  ]);
}

describe('callOnIntegration', () => {
  it('only allows authorized users', async () => {
    const {
      accounts: { 0: newAuthUser },
      deployment: { mockGenericAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = await mockGenericSwapArgs({
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [],
      minIncomingAssetAmounts: [],
      incomingAssetAmounts: [],
    });
    const callArgs = await callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    // Call should be allowed by the fund owner
    const goodSwapTx1 = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(goodSwapTx1).resolves.toBeReceipt();

    // Call not allowed by the yet-to-be authorized user
    const swapTx = comptrollerProxy
      .connect(newAuthUser)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(swapTx).rejects.toBeRevertedWith('Not an authorized user');

    // Set the new auth user
    const addAuthUserForFundTx = integrationManager
      .connect(fundOwner)
      .addAuthUserForFund(comptrollerProxy, newAuthUser);
    await expect(addAuthUserForFundTx).resolves.toBeReceipt();

    // Call should be allowed for the authorized user
    const goodSwapTx2 = comptrollerProxy
      .connect(newAuthUser)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(goodSwapTx2).resolves.toBeReceipt();
  });

  it('does not allow an unregistered adapter', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const deregisterAdaptersTx = integrationManager.deregisterAdapters([
      mockGenericAdapter,
    ]);
    await expect(deregisterAdaptersTx).resolves.toBeReceipt();

    const badSwapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [0],
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
    });

    await expect(badSwapTx).rejects.toBeRevertedWith(
      'adapter is not registered',
    );
  });

  it('does not allow spendAssets and spendAssetAmounts arrays to have unequal lengths', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { mln: incomingAsset, weth, dai },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = await mockGenericSwapArgs({
      spendAssets: [weth, dai],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });
    const callArgs = await callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    const swapTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(swapTx).rejects.toBeRevertedWith(
      'spend assets arrays unequal',
    );
  });

  it('does not allow incomingAssets and incomingAssetAmounts arrays to have unequal lengths', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { mln: outgoingAsset, weth, dai },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = await mockGenericSwapArgs({
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [weth, dai],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });
    const callArgs = await callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    const swapTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(swapTx).rejects.toBeRevertedWith(
      'incoming assets arrays unequal',
    );
  });

  it('does not allow duplicate spend assets', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { mln: outgoingAsset, weth: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = await mockGenericSwapArgs({
      spendAssets: [outgoingAsset, outgoingAsset],
      spendAssetAmounts: Array(2).fill(utils.parseEther('1')),
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });
    const callArgs = await callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    const swapTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(swapTx).rejects.toBeRevertedWith(
      'duplicate spend asset detected',
    );
  });

  it('does not allow duplicate incoming assets', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { mln: outgoingAsset, weth: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = await mockGenericSwapArgs({
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset, incomingAsset],
      minIncomingAssetAmounts: Array(2).fill(utils.parseEther('1')),
      incomingAssetAmounts: [],
    });
    const callArgs = await callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    const swapTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(swapTx).rejects.toBeRevertedWith(
      'duplicate incoming asset detected',
    );
  });

  it('does not allow a non-receivable asset', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { weth: outgoingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const nonReceivalbleToken = await new StandardToken(
      randomAddress(),
      provider,
    );

    const badSwapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [nonReceivalbleToken],
      minIncomingAssetAmounts: [utils.parseEther('1')],
    });

    await expect(badSwapTx).rejects.toBeRevertedWith(
      'non-receivable asset detected',
    );
  });

  it('does not allow incomingAsset received to be less than expected', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const badSwapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('2')],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
      seedFund: true,
    });

    await expect(badSwapTx).rejects.toBeRevertedWith(
      'received incoming asset less than expected',
    );
  });

  it('does not allow empty spend asset address', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = await mockGenericSwapArgs({
      spendAssets: [constants.AddressZero],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });
    const callArgs = await callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    const swapTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(swapTx).rejects.toBeRevertedWith('empty spendAsset detected');
  });

  it('does not allow empty incoming asset address', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { mln: outgoingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = await mockGenericSwapArgs({
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [constants.AddressZero],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });

    const callArgs = await callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    const swapTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(
        integrationManager,
        integrationManagerActionIds.CallOnIntegration,
        callArgs,
      );
    await expect(swapTx).rejects.toBeRevertedWith(
      'empty incoming asset address',
    );
  });

  it('does not allow empty spend asset amount', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const badSwapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [0],
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
    });

    await expect(badSwapTx).rejects.toBeRevertedWith(
      'empty spendAssetAmount detected',
    );
  });

  it.todo('does not allow a fund to exceed the trackedAssetsLimit');
});

describe('valid calls', () => {
  it('handles multiple incoming assets and multiple spend assets', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        tokens: { dai, knc, mln, weth },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets = [dai, knc];
    const spendAssetAmounts = Array(2).fill(utils.parseEther('1'));
    const incomingAssets = [mln, weth];
    const incomingAssetAmounts = [utils.parseEther('1'), utils.parseEther('2')];
    const minIncomingAssetAmounts = Array(2).fill(utils.parseEther('1'));

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
      seedFund: true,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: spendAssets.map((token) => token.address),
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const spendAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });
    await expect(spendAssetBalancesCall).resolves.toEqual(
      Array(2).fill(utils.parseEther('0')),
    );

    const incomingAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    await expect(incomingAssetBalancesCall).resolves.toEqual(
      incomingAssetAmounts,
    );
  });

  it('handles untracked incoming asset with a non-zero starting balance', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        tokens: { knc },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // seed fund with incomingAsset
    const seedFundAmount = utils.parseEther('1');
    await knc.transfer(vaultProxy, seedFundAmount);

    const spendAssets: [] = [];
    const spendAssetAmounts: [] = [];
    const incomingAssets = [knc];
    const incomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];
    const expectedIncomingAssetAmount = incomingAssetAmounts[0].add(
      seedFundAmount,
    );

    const preTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(preTxGetTrackedAssetsCall).resolves.toEqual([]);

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        [expectedIncomingAssetAmount],
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const incomingAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    await expect(incomingAssetBalancesCall).resolves.toEqual([
      expectedIncomingAssetAmount,
    ]);

    const postTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(postTxGetTrackedAssetsCall).resolves.toEqual(
      incomingAssets.map((token) => token.address),
    );
  });

  it('handles untracked incoming asset with a zero starting balance', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        tokens: { knc },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets: [] = [];
    const spendAssetAmounts: [] = [];
    const incomingAssets = [knc];
    const incomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    const preTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(preTxGetTrackedAssetsCall).resolves.toEqual([]);

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const incomingAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    await expect(incomingAssetBalancesCall).resolves.toEqual(
      incomingAssetAmounts,
    );

    const postTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(postTxGetTrackedAssetsCall).resolves.toEqual(
      incomingAssets.map((token) => token.address),
    );
  });

  it('handles a spend asset that is also an incoming asset and increases', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        tokens: { mln },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets = [mln];
    const spendAssetAmounts = [utils.parseEther('1')];
    const incomingAssets = [mln];
    const incomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
      seedFund: true,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts,
        [],
        [],
      ),
    );

    const spendAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });
    await expect(spendAssetBalancesCall).resolves.toEqual(incomingAssetAmounts);
  });

  it('handles a spend asset that is also an incoming asset and decreases', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        tokens: { mln },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // seed fund
    const amount = utils.parseEther('75');
    await mln.transfer(vaultProxy, amount);

    const spendAssets = [mln];
    const spendAssetAmounts = [utils.parseEther('50')];
    const incomingAssets = [mln];
    const incomingAssetAmounts = [utils.parseEther('1')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];
    const expectedSpendAssetBalance = amount
      .sub(spendAssetAmounts[0])
      .add(incomingAssetAmounts[0]);

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts: [expectedSpendAssetBalance],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        [expectedSpendAssetBalance],
        [],
        [],
      ),
    );

    const incomingAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    await expect(incomingAssetBalancesCall).resolves.toEqual([
      expectedSpendAssetBalance,
    ]);
  });

  it('handles a spend asset that is not an incoming asset and increases', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        tokens: { mln },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssetAmountOnAdapter = BigNumber.from(5);
    await mln.transfer(mockGenericAdapter, spendAssetAmountOnAdapter);

    const spendAssets = [mln];
    const spendAssetAmounts = [BigNumber.from(1)];
    const incomingAssets: [] = [];
    const incomingAssetAmounts: [] = [];
    const minIncomingAssetAmounts: [] = [];

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
      seedFund: true,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    // Actual incoming asset info, accounting for token balance on adapter
    const actualIncomingAssets = spendAssets;
    const actualIncomingAssetAmounts = [
      spendAssetAmountOnAdapter.sub(spendAssetAmounts[0]),
    ];

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: actualIncomingAssets.map((token) => token.address),
      incomingAssetAmounts: actualIncomingAssetAmounts,
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        actualIncomingAssets,
        actualIncomingAssetAmounts,
        [],
        [],
      ),
    );

    const spendAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });
    await expect(spendAssetBalancesCall).resolves.toEqual([
      spendAssetAmountOnAdapter,
    ]);
  });

  it('handles empty spend assets and incoming assets', async () => {
    const {
      deployment: { integrationManager, mockGenericAdapter, policyManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets: [] = [];
    const spendAssetAmounts: [] = [];
    const incomingAssets: [] = [];
    const incomingAssetAmounts: [] = [];
    const minIncomingAssetAmounts: [] = [];

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );
  });

  it('handles a spend asset that is completely spent', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        tokens: { mln, weth },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    await seedFundByTrading({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      incomingAsset: mln,
      incomingAssetAmount: utils.parseEther('1'),
    });

    const spendAssets = [mln];
    const spendAssetAmounts = [utils.parseEther('1')];
    const incomingAssets = [weth];
    const incomingAssetAmounts = [utils.parseEther('1')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts: incomingAssetAmounts,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(swapTx, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: spendAssets.map((token) => token.address),
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const spendAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });
    await expect(spendAssetBalancesCall).resolves.toEqual([
      utils.parseEther('0'),
    ]);

    const incomingAssetBalancesCall = getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    await expect(incomingAssetBalancesCall).resolves.toEqual(
      incomingAssetAmounts,
    );

    const postTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(postTxGetTrackedAssetsCall).resolves.toEqual(
      incomingAssets.map((token) => token.address),
    );
  });

  it('handles a fund that is at the exact trackedAssetsLimit', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        tokens: { mln },
      },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Seed the fund with its denomination asset. There should only be 1 tracked asset in the fund.
    const initialAssetAmount = utils.parseEther('1');
    await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [denominationAsset],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [initialAssetAmount],
    });
    const nextTrackedAssetsLimit = 1;
    const trackedAssetsLength = (await vaultProxy.getTrackedAssets()).length;
    expect(trackedAssetsLength).toBe(nextTrackedAssetsLimit);

    // Reduce the trackedAssetLimit to the number of assets in the fund (1 asset)
    await integrationManager.setTrackedAssetsLimit(nextTrackedAssetsLimit);

    // Adding a new asset while not reducing the asset count should fail
    const badSwapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [mln],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
    });
    await expect(badSwapTx).rejects.toBeRevertedWith('Limit exceeded');

    // Adding more of a tracked asset should succeed
    const additionalAssetAmount = utils.parseEther('1');
    const goodSwapTx1 = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [denominationAsset],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [additionalAssetAmount],
    });
    await expect(goodSwapTx1).resolves.toBeReceipt();

    // Adding a new asset while reducing the asset count by 1 should succeed
    const goodSwapTx2 = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [denominationAsset],
      spendAssetAmounts: [initialAssetAmount.add(additionalAssetAmount)],
      incomingAssets: [mln],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
    });
    await expect(goodSwapTx2).resolves.toBeReceipt();
  });

  it('handles a fund that exceeds the trackedAssetsLimit', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        tokens: { mln },
      },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Seed the fund with its denomination asset. There should only be 1 tracked asset in the fund.
    const initialAssetAmount = utils.parseEther('1');
    await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [denominationAsset],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [initialAssetAmount],
    });
    const trackedAssetsLength = (await vaultProxy.getTrackedAssets()).length;
    expect(trackedAssetsLength).toBe(1);

    // Reduce the trackedAssetLimit to 0. The fund now exceeds the limit by 1.
    await integrationManager.setTrackedAssetsLimit(0);

    // Adding a new asset while not reducing the asset count should fail
    const badSwapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [mln],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
    });
    await expect(badSwapTx).rejects.toBeRevertedWith('Limit exceeded');

    // Adding more of a tracked asset should succeed
    const additionalAssetAmount = utils.parseEther('1');
    const goodSwapTx1 = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [denominationAsset],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [additionalAssetAmount],
    });
    await expect(goodSwapTx1).resolves.toBeReceipt();

    // Adding a new asset while reducing the asset count by 1 should succeed
    const goodSwapTx2 = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [denominationAsset],
      spendAssetAmounts: [initialAssetAmount.add(additionalAssetAmount)],
      incomingAssets: [mln],
      minIncomingAssetAmounts: [BigNumber.from(1)],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
    });
    await expect(goodSwapTx2).resolves.toBeReceipt();
  });

  it.todo('add integrationData to the event return values in all tests');

  it.todo('test SpendAssetsHandleType options');
});
