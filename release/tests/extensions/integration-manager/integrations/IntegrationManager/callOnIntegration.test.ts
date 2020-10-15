import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent, mocks } from '@melonproject/utils';
import { BigNumber, BigNumberish, constants, Signer, utils } from 'ethers';
import { defaultTestDeployment } from '../../../../..';
import { IERC20 } from '../../../../../codegen/IERC20';
import {
  callOnIntegrationSelector,
  callOnIntegrationArgs,
  createNewFund,
  mockGenericSwap,
  mockGenericSwapArgs,
  mockGenericSwapASelector,
  policyHookExecutionTimes,
  policyHooks,
  validateRulePostCoIArgs,
  validateRulePreCoIArgs,
} from '../../../../utils';
import {
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '../../../../../utils/contracts';

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
  mockGenericAdapter: mocks.MockGenericAdapter;
  incomingAsset: IERC20;
  incomingAssetAmount: BigNumberish;
}) {
  const preTxAssetBalancesCall = vaultProxy.getAssetBalances([incomingAsset]);
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

  const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
    'CallOnIntegrationExecuted',
  );

  await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
    adapter: mockGenericAdapter.address,
    comptrollerProxy: comptrollerProxy.address,
    caller: await fundOwner.getAddress(),
    incomingAssets: [incomingAsset.address],
    incomingAssetAmounts: [incomingAssetAmount],
    outgoingAssets: [],
    outgoingAssetAmounts: [],
    vaultProxy: vaultProxy.address,
  });

  const postTxAssetBalancesCall = vaultProxy.getAssetBalances([incomingAsset]);
  await expect(postTxAssetBalancesCall).resolves.toEqual([incomingAssetAmount]);
  const postTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
  await expect(postTxGetTrackedAssetsCall).resolves.toEqual([
    incomingAsset.address,
  ]);
}

describe('callOnIntegration', () => {
  it.todo('does not allow an unauthorized caller');

  it.todo('does not allow a non-accessor of the specified vaultProxy');

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
      .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
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
      .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
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
      .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
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
      .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
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

    const nonReceivalbleToken = await new IERC20(randomAddress(), provider);

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
      .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
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
      .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
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
      'spend asset amount must be >0',
    );
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: spendAssets.map((token) => token.address),
      outgoingAssetAmounts: spendAssetAmounts,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        incomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const spendAssetBalancesCall = vaultProxy.getAssetBalances(spendAssets);
    await expect(spendAssetBalancesCall).resolves.toEqual(
      Array(2).fill(utils.parseEther('0')),
    );

    const incomingAssetBalancesCall = vaultProxy.getAssetBalances(
      incomingAssets,
    );
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        [expectedIncomingAssetAmount],
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const incomingAssetBalancesCall = vaultProxy.getAssetBalances(
      incomingAssets,
    );
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        incomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const incomingAssetBalancesCall = vaultProxy.getAssetBalances(
      incomingAssets,
    );
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        incomingAssetAmounts,
        [],
        [],
      ),
    );

    const spendAssetBalancesCall = vaultProxy.getAssetBalances(spendAssets);
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts: [expectedSpendAssetBalance],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        [expectedSpendAssetBalance],
        [],
        [],
      ),
    );

    const incomingAssetBalancesCall = vaultProxy.getAssetBalances(
      incomingAssets,
    );
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        incomingAssetAmounts,
        [],
        [],
      ),
    );

    const spendAssetBalancesCall = vaultProxy.getAssetBalances(spendAssets);
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets: spendAssets,
      outgoingAssetAmounts: spendAssetAmounts,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
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

    const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecuted',
    );

    await assertEvent(swapTx, callOnIntegrationExecutedEvent, {
      adapter: mockGenericAdapter.address,
      comptrollerProxy: comptrollerProxy.address,
      caller: await fundOwner.getAddress(),
      incomingAssets: incomingAssets.map((token) => token.address),
      incomingAssetAmounts,
      outgoingAssets: spendAssets.map((token) => token.address),
      outgoingAssetAmounts: spendAssetAmounts,
      vaultProxy: vaultProxy.address,
    });

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Pre,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    expect(policyManager.validatePolicies.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      policyHooks.CallOnIntegration,
      policyHookExecutionTimes.Post,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        incomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    const spendAssetBalancesCall = vaultProxy.getAssetBalances(spendAssets);
    await expect(spendAssetBalancesCall).resolves.toEqual([
      utils.parseEther('0'),
    ]);

    const incomingAssetBalancesCall = vaultProxy.getAssetBalances(
      incomingAssets,
    );
    await expect(incomingAssetBalancesCall).resolves.toEqual(
      incomingAssetAmounts,
    );

    const postTxGetTrackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(postTxGetTrackedAssetsCall).resolves.toEqual(
      incomingAssets.map((token) => token.address),
    );
  });
});
