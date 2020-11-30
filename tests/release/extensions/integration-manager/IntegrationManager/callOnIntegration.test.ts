import { BigNumber, BigNumberish, constants, utils } from 'ethers';
import { EthereumTestnetProvider, randomAddress, SignerWithAddress } from '@crestproject/crestproject';
import {
  addTrackedAssets,
  assertEvent,
  defaultTestDeployment,
  createNewFund,
  getAssetBalances,
  mockGenericSwap,
  mockGenericSwapArgs,
  mockGenericSwapASelector,
} from '@melonproject/testutils';
import {
  MockGenericAdapter,
  StandardToken,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
  callOnIntegrationArgs,
  PolicyHook,
  validateRulePostCoIArgs,
  validateRulePreCoIArgs,
  IntegrationManagerActionId,
} from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

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
  fundOwner: SignerWithAddress;
  mockGenericAdapter: MockGenericAdapter;
  incomingAsset: StandardToken;
  incomingAssetAmount: BigNumberish;
}) {
  const preTxAssetBalancesCall = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset],
  });
  expect(preTxAssetBalancesCall).toEqual([utils.parseEther('0')]);
  const preTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
  expect(preTxGetTrackedAssetsCall).toEqual([]);

  const swapArgs = {
    spendAssets: [],
    spendAssetAmounts: [],
    incomingAssets: [incomingAsset],
    minIncomingAssetAmounts: [BigNumber.from(1)],
    incomingAssetAmounts: [incomingAssetAmount],
  };

  const receipt = await mockGenericSwap({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    mockGenericAdapter,
    seedFund: true,
    ...swapArgs,
  });

  const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

  const integrationData = mockGenericSwapArgs({ ...swapArgs });

  assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
    adapter: mockGenericAdapter,
    comptrollerProxy,
    caller: fundOwner,
    incomingAssets: [incomingAsset],
    incomingAssetAmounts: [incomingAssetAmount],
    outgoingAssets: [],
    outgoingAssetAmounts: [],
    selector: mockGenericSwapASelector,
    integrationData,
    vaultProxy,
  });

  const postTxAssetBalancesCall = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset],
  });

  expect(postTxAssetBalancesCall).toEqual([incomingAssetAmount]);
  const postTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
  expect(postTxGetTrackedAssetsCall).toEqual([incomingAsset.address]);
}

describe('callOnIntegration', () => {
  it('only allows authorized users', async () => {
    const {
      accounts: [newAuthUser],
      deployment: { mockGenericAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [],
      spendAssetAmounts: [],
      incomingAssets: [],
      minIncomingAssetAmounts: [],
      incomingAssetAmounts: [],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    // Call should be allowed by the fund owner
    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).resolves.toBeReceipt();

    // Call not allowed by the yet-to-be authorized user
    await expect(
      comptrollerProxy
        .connect(newAuthUser)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Not an authorized user');

    // Set the new auth user
    await integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newAuthUser);

    // Call should be allowed for the authorized user
    await expect(
      comptrollerProxy
        .connect(newAuthUser)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).resolves.toBeReceipt();
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

    await expect(integrationManager.deregisterAdapters([mockGenericAdapter])).resolves.toBeReceipt();

    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        spendAssetAmounts: [0],
        incomingAssets: [incomingAsset],
        minIncomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).rejects.toBeRevertedWith('Adapter is not registered');
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

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [weth, dai],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Spend assets arrays unequal');
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

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [weth, dai],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Incoming assets arrays unequal');
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

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [outgoingAsset, outgoingAsset],
      spendAssetAmounts: Array(2).fill(utils.parseEther('1')),
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Duplicate spend asset');
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

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset, incomingAsset],
      minIncomingAssetAmounts: Array(2).fill(utils.parseEther('1')),
      incomingAssetAmounts: [],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Duplicate incoming asset');
  });

  it('does not allow a non-receivable incoming asset', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { weth: outgoingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const nonReceivableToken = new StandardToken(randomAddress(), provider);
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        spendAssetAmounts: [utils.parseEther('1')],
        incomingAssets: [nonReceivableToken],
        minIncomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');
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

    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        spendAssetAmounts: [utils.parseEther('1')],
        incomingAssets: [incomingAsset],
        minIncomingAssetAmounts: [utils.parseEther('2')],
        incomingAssetAmounts: [utils.parseEther('1')],
        seedFund: true,
      }),
    ).rejects.toBeRevertedWith('Received incoming asset less than expected');
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

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [constants.AddressZero],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Empty spend asset');
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

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [outgoingAsset],
      spendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [constants.AddressZero],
      minIncomingAssetAmounts: [utils.parseEther('1')],
      incomingAssetAmounts: [],
    });

    const callArgs = callOnIntegrationArgs({
      adapter: mockGenericAdapter,
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
    });

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs),
    ).rejects.toBeRevertedWith('Empty incoming asset address');
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

    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        spendAssetAmounts: [0],
        incomingAssets: [incomingAsset],
        minIncomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).rejects.toBeRevertedWith('Empty spend asset amount');
  });

  it('does not allow a fund to exceed the trackedAssetsLimit', async () => {
    const {
      deployment: {
        mockGenericAdapter,
        tokens: { weth, mln, dai, knc },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Reduce the trackedAssetLimit to the number of assets in the fund (1 asset)
    await integrationManager.setTrackedAssetsLimit(1);

    const spendAssets = [dai, knc];
    const spendAssetAmounts = Array(2).fill(utils.parseEther('1'));
    const incomingAssets = [mln, weth];
    const incomingAssetAmounts = [utils.parseEther('1'), utils.parseEther('2')];
    const minIncomingAssetAmounts = Array(2).fill(utils.parseEther('1'));

    const swapCall = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      incomingAssetAmounts: incomingAssetAmounts,
      seedFund: true,
    });

    await expect(swapCall).rejects.toBeRevertedWith('Limit exceeded');
  });
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

    const swapArgs = {
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      incomingAssetAmounts,
    };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      seedFund: true,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: incomingAssetAmounts,
        outgoingAssets: spendAssets,
        outgoingAssetAmounts: spendAssetAmounts,
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
    expect(incomingAssetBalancesCall).toEqual(incomingAssetAmounts);
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
    const expectedIncomingAssetAmount = incomingAssetAmounts[0].add(seedFundAmount);

    const preTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(preTxGetTrackedAssetsCall).toEqual([]);

    const swapArgs = { spendAssets, spendAssetAmounts, incomingAssets, minIncomingAssetAmounts, incomingAssetAmounts };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets: incomingAssets,
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: [expectedIncomingAssetAmount],
        outgoingAssets: spendAssets,
        outgoingAssetAmounts: spendAssetAmounts,
      }),
    );

    const incomingAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    expect(incomingAssetBalancesCall).toEqual([expectedIncomingAssetAmount]);
    const postTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(postTxGetTrackedAssetsCall).toEqual(incomingAssets.map((token) => token.address));
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

    const preTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(preTxGetTrackedAssetsCall).toEqual([]);

    const swapArgs = { spendAssets, spendAssetAmounts, incomingAssets, minIncomingAssetAmounts, incomingAssetAmounts };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: incomingAssetAmounts,
        outgoingAssets: spendAssets,
        outgoingAssetAmounts: spendAssetAmounts,
      }),
    );

    const incomingAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    expect(incomingAssetBalancesCall).toEqual(incomingAssetAmounts);
    const postTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(postTxGetTrackedAssetsCall).toEqual(incomingAssets.map((token) => token.address));
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

    const swapArgs = { spendAssets, spendAssetAmounts, incomingAssets, minIncomingAssetAmounts, incomingAssetAmounts };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      seedFund: true,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: incomingAssetAmounts,
        outgoingAssets: [],
        outgoingAssetAmounts: [],
      }),
    );

    const spendAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });
    expect(spendAssetBalancesCall).toEqual(incomingAssetAmounts);
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
    const expectedSpendAssetBalance = amount.sub(spendAssetAmounts[0]).add(incomingAssetAmounts[0]);

    const swapArgs = { spendAssets, spendAssetAmounts, incomingAssets, minIncomingAssetAmounts, incomingAssetAmounts };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets,
      incomingAssetAmounts: [expectedSpendAssetBalance],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: [expectedSpendAssetBalance],
        outgoingAssets: [],
        outgoingAssetAmounts: [],
      }),
    );

    const incomingAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    expect(incomingAssetBalancesCall).toEqual([expectedSpendAssetBalance]);
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

    const swapArgs = {
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      incomingAssetAmounts: incomingAssetAmounts,
    };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      seedFund: true,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    // Actual incoming asset info, accounting for token balance on adapter
    const actualIncomingAssets = spendAssets;
    const actualIncomingAssetAmounts = [spendAssetAmountOnAdapter.sub(spendAssetAmounts[0])];

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy: comptrollerProxy,
      caller: fundOwner,
      incomingAssets: actualIncomingAssets,
      incomingAssetAmounts: actualIncomingAssetAmounts,
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: actualIncomingAssets,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        outgoingAssets: [],
        outgoingAssetAmounts: [],
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
      deployment: {
        integrationManager,
        mockGenericAdapter,
        policyManager,
        trackedAssetsAdapter,
        tokens: { mln: spendAsset },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssetAmount = utils.parseEther('1');
    const spendAssetRebate = utils.parseEther('0.1');

    // Seed and track the spend asset in the VaultProxy
    spendAsset.transfer(vaultProxy, spendAssetAmount);
    await addTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter,
      incomingAssets: [spendAsset],
    });

    // Seed the adapter with the spend asset amount to refund
    await spendAsset.transfer(mockGenericAdapter, spendAssetRebate);

    // Define spend assets and actual incoming assets
    const spendAssets = [spendAsset];
    const spendAssetAmounts = [spendAssetAmount];
    const outgoingAssets = spendAssets;
    const outgoingAssetAmounts = [spendAssetAmount.sub(spendAssetRebate)];

    // Swap the spend assets and receive the rebate
    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
    });

    // Assert that the rebated amount was received and that the spend asset is still tracked
    expect(await spendAsset.balanceOf(vaultProxy)).toEqual(spendAssetRebate);
    expect(await vaultProxy.isTrackedAsset(spendAsset)).toBe(true);

    // Assert event emitted correctly
    assertEvent(receipt, integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund'), {
      adapter: mockGenericAdapter,
      comptrollerProxy: comptrollerProxy,
      caller: fundOwner,
      incomingAssets: [],
      incomingAssetAmounts: [],
      outgoingAssets,
      outgoingAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData: mockGenericSwapArgs({
        spendAssets,
        spendAssetAmounts,
      }),
      vaultProxy,
    });

    // Assert expected calls to PolicyManager
    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: [],
        incomingAssetAmounts: [],
        outgoingAssets,
        outgoingAssetAmounts,
      }),
    );
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

    const swapArgs = { spendAssets, spendAssetAmounts, incomingAssets, minIncomingAssetAmounts, incomingAssetAmounts };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: incomingAssetAmounts,
        outgoingAssets: spendAssets,
        outgoingAssetAmounts: spendAssetAmounts,
      }),
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

    const swapArgs = {
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      incomingAssetAmounts,
    };

    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      ...swapArgs,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const integrationData = mockGenericSwapArgs({ ...swapArgs });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: incomingAssetAmounts,
        outgoingAssets: spendAssets,
        outgoingAssetAmounts: spendAssetAmounts,
      }),
    );

    const spendAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: spendAssets,
    });

    expect(spendAssetBalancesCall).toEqual([utils.parseEther('0')]);
    const incomingAssetBalancesCall = await getAssetBalances({
      account: vaultProxy,
      assets: incomingAssets,
    });
    expect(incomingAssetBalancesCall).toEqual(incomingAssetAmounts);
    const postTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(postTxGetTrackedAssetsCall).toEqual(incomingAssets.map((token) => token.address));
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
      incomingAssetAmounts: [initialAssetAmount],
    });
    const nextTrackedAssetsLimit = 1;
    const trackedAssetsLength = (await vaultProxy.getTrackedAssets()).length;
    expect(trackedAssetsLength).toBe(nextTrackedAssetsLimit);

    // Reduce the trackedAssetLimit to the number of assets in the fund (1 asset)
    await integrationManager.setTrackedAssetsLimit(nextTrackedAssetsLimit);

    // Adding a new asset while not reducing the asset count should fail
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [],
        spendAssetAmounts: [],
        incomingAssets: [mln],
        minIncomingAssetAmounts: [BigNumber.from(1)],
        incomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).rejects.toBeRevertedWith('Limit exceeded');

    // Adding more of a tracked asset should succeed
    const additionalAssetAmount = utils.parseEther('1');
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [],
        spendAssetAmounts: [],
        incomingAssets: [denominationAsset],
        minIncomingAssetAmounts: [BigNumber.from(1)],
        incomingAssetAmounts: [additionalAssetAmount],
      }),
    ).resolves.toBeReceipt();

    // Adding a new asset while reducing the asset count by 1 should succeed
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [denominationAsset],
        spendAssetAmounts: [initialAssetAmount.add(additionalAssetAmount)],
        incomingAssets: [mln],
        minIncomingAssetAmounts: [BigNumber.from(1)],
        incomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).resolves.toBeReceipt();
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
      incomingAssetAmounts: [initialAssetAmount],
    });

    const trackedAssetsLength = (await vaultProxy.getTrackedAssets()).length;
    expect(trackedAssetsLength).toBe(1);

    // Reduce the trackedAssetLimit to 0. The fund now exceeds the limit by 1.
    await integrationManager.setTrackedAssetsLimit(0);

    // Adding a new asset while not reducing the asset count should fail
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [],
        spendAssetAmounts: [],
        incomingAssets: [mln],
        minIncomingAssetAmounts: [BigNumber.from(1)],
        incomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).rejects.toBeRevertedWith('Limit exceeded');

    // Adding more of a tracked asset should succeed
    const additionalAssetAmount = utils.parseEther('1');
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [],
        spendAssetAmounts: [],
        incomingAssets: [denominationAsset],
        minIncomingAssetAmounts: [BigNumber.from(1)],
        incomingAssetAmounts: [additionalAssetAmount],
      }),
    ).resolves.toBeReceipt();

    // Adding a new asset while reducing the asset count by 1 should succeed
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [denominationAsset],
        spendAssetAmounts: [initialAssetAmount.add(additionalAssetAmount)],
        incomingAssets: [mln],
        minIncomingAssetAmounts: [BigNumber.from(1)],
        incomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).resolves.toBeReceipt();
  });

  describe('SpendAssetsHandleType', () => {
    it.todo('does not approve or transfer a spend asset if type is `None`');

    it.todo('approves adapter with spend asset allowance if type is `Approve`');

    it.todo('transfers spend asset to adapter if type is `Transfer`');
  });
});
