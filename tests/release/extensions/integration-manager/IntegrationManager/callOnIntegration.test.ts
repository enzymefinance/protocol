import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  encodeArgs,
  IntegrationManager,
  IntegrationManagerActionId,
  MockGenericAdapter,
  MockGenericIntegratee,
  PolicyHook,
  sighash,
  StandardToken,
  validateRulePostCoIArgs,
  VaultLib,
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
} from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const weth = new WETH(config.weth, whales.weth);
  const knc = new StandardToken(config.primitives.knc, whales.knc);
  const dai = new StandardToken(config.primitives.dai, whales.dai);
  const mln = new StandardToken(config.primitives.mln, whales.mln);

  const mockGenericIntegratee = await MockGenericIntegratee.deploy(deployer);
  const mockGenericAdapter = await MockGenericAdapter.deploy(deployer, mockGenericIntegratee);
  await deployment.integrationManager.registerAdapters([mockGenericAdapter]);

  await Promise.all([
    knc.transfer(mockGenericIntegratee, utils.parseEther('1000')),
    dai.transfer(mockGenericIntegratee, utils.parseEther('1000')),
    mln.transfer(mockGenericIntegratee, utils.parseEther('1000')),
    weth.transfer(mockGenericIntegratee, utils.parseEther('1000')),
  ]);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: weth,
  });

  return {
    mockGenericAdapter,
    mockGenericIntegratee,
    accounts: remainingAccounts,
    deployment,
    config,
    tokens: { knc, weth, dai, mln },
    fund: {
      comptrollerProxy,
      denominationAsset: weth,
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
  const swapArgs = {
    spendAssets: [],
    actualSpendAssetAmounts: [],
    incomingAssets: [incomingAsset],
    minIncomingAssetAmounts: [BigNumber.from(1)],
    actualIncomingAssetAmounts: [incomingAssetAmount],
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
    spendAssets: [],
    spendAssetAmounts: [],
    selector: mockGenericSwapASelector,
    integrationData,
    vaultProxy,
  });
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
      selector: mockGenericSwapASelector,
      encodedCallArgs: swapArgs,
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

  it('does not allow an unregistered adapter', async () => {
    const {
      mockGenericAdapter,
      deployment: { integrationManager },
      tokens: { weth: spendAsset, mln: incomingAsset },
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
        spendAssets: [spendAsset],
        actualSpendAssetAmounts: [0],
        incomingAssets: [incomingAsset],
        minIncomingAssetAmounts: [utils.parseEther('1')],
      }),
    ).rejects.toBeRevertedWith('Adapter is not registered');
  });

  it('does not allow spendAssets and actualSpendAssetAmounts arrays to have unequal lengths', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln: incomingAsset, weth, dai },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [weth, dai],
      actualSpendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
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
      mockGenericAdapter,
      tokens: { mln: spendAsset, weth, dai },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [spendAsset],
      actualSpendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [weth, dai],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
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
      mockGenericAdapter,
      tokens: { mln: spendAsset, weth: incomingAsset },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [spendAsset, spendAsset],
      actualSpendAssetAmounts: Array(2).fill(utils.parseEther('1')),
      incomingAssets: [incomingAsset],
      actualIncomingAssetAmounts: [utils.parseEther('1')],
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
      mockGenericAdapter,
      tokens: { mln: spendAsset, weth: incomingAsset },
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const swapArgs = mockGenericSwapArgs({
      spendAssets: [spendAsset],
      actualSpendAssetAmounts: [utils.parseEther('1')],
      incomingAssets: [incomingAsset, incomingAsset],
      actualIncomingAssetAmounts: Array(2).fill(utils.parseEther('1')),
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
      mockGenericAdapter,
      tokens: { weth: spendAsset },
      deployment: { integrationManager },
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
        spendAssets: [spendAsset],
        actualSpendAssetAmounts: [utils.parseEther('1')],
        incomingAssets: [nonReceivableToken],
        minIncomingAssetAmounts: [utils.parseEther('1')],
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

    // Seed fund with actualSpendAssetAmount
    await spendAsset.transfer(vaultProxy, actualSpendAssetAmount);

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
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        selector: mockGenericSwapDirectFromVaultSelector,
        spendAssets: [spendAsset],
        maxSpendAssetAmounts: [maxSpendAssetAmount],
        actualSpendAssetAmounts: [actualSpendAssetAmount],
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
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [spendAsset],
        actualSpendAssetAmounts: [utils.parseEther('1')],
        incomingAssets: [incomingAsset],
        minIncomingAssetAmounts: [utils.parseEther('2')],
        actualIncomingAssetAmounts: [utils.parseEther('1')],
        seedFund: true,
      }),
    ).rejects.toBeRevertedWith('Received incoming asset less than expected');
  });
});

describe('valid calls', () => {
  it('handles multiple incoming assets and multiple spend assets', async () => {
    const {
      tokens: { dai, knc, mln, weth },
      mockGenericAdapter,
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets = [dai, knc];
    const actualSpendAssetAmounts = Array(2).fill(utils.parseEther('1'));
    const incomingAssets = [mln, weth];
    const actualIncomingAssetAmounts = [utils.parseEther('1'), utils.parseEther('2')];
    const minIncomingAssetAmounts = Array(2).fill(utils.parseEther('1'));

    const swapArgs = {
      spendAssets,
      actualSpendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts,
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
      incomingAssetAmounts: actualIncomingAssetAmounts,
      spendAssets: spendAssets,
      spendAssetAmounts: actualSpendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        spendAssets: spendAssets,
        spendAssetAmounts: actualSpendAssetAmounts,
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
      tokens: { knc },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // seed fund with incomingAsset
    const seedFundAmount = utils.parseEther('1');
    await knc.transfer(vaultProxy, seedFundAmount);

    const spendAssets: [] = [];
    const actualSpendAssetAmounts: [] = [];
    const incomingAssets = [knc];
    const actualIncomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    // If an asset is untracked with balanceA in the vault, and an adapter action adds amountB to the vault,
    // then the actual amount accrued in the tx is amountB, even though the GAV has increased by balanceA + amountB.
    const expectedIncomingAssetAmount = actualIncomingAssetAmounts[0];

    const preTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(preTxGetTrackedAssetsCall).toEqual([denominationAsset.address]);

    const swapArgs = { incomingAssets, minIncomingAssetAmounts, actualIncomingAssetAmounts };

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
      spendAssets: spendAssets,
      spendAssetAmounts: actualSpendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: incomingAssets,
        incomingAssetAmounts: [expectedIncomingAssetAmount],
        spendAssets: spendAssets,
        spendAssetAmounts: actualSpendAssetAmounts,
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
      tokens: { knc },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const spendAssets: [] = [];
    const actualSpendAssetAmounts: [] = [];
    const incomingAssets = [knc];
    const actualIncomingAssetAmounts = [utils.parseEther('2')];
    const minIncomingAssetAmounts = [utils.parseEther('1')];

    const preTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(preTxGetTrackedAssetsCall).toEqual([denominationAsset.address]);

    const swapArgs = { incomingAssets, minIncomingAssetAmounts, actualIncomingAssetAmounts };

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
      incomingAssetAmounts: actualIncomingAssetAmounts,
      spendAssets: spendAssets,
      spendAssetAmounts: actualSpendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        spendAssets: spendAssets,
        spendAssetAmounts: actualSpendAssetAmounts,
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
      spendAssets,
      actualSpendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts,
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

    // Though the spend amount is 0, we still expect this to be reported in the event, as 0 values are not filtered out
    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy,
      caller: fundOwner,
      incomingAssets,
      incomingAssetAmounts: expectedIncomingAssetAmounts,
      spendAssets,
      spendAssetAmounts: expectedSpendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts: expectedIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts: expectedSpendAssetAmounts,
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
    await mln.transfer(mockGenericAdapter, spendAssetAmountOnAdapter);

    const spendAssets = [mln];
    const actualSpendAssetAmounts = [BigNumber.from(1)];

    const swapArgs = {
      spendAssets,
      actualSpendAssetAmounts,
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

    // Unless specified as an incoming asset, a spend asset that increases in balance will simply
    // show as a spend amount with a 0 balance
    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      adapter: mockGenericAdapter,
      comptrollerProxy: comptrollerProxy,
      caller: fundOwner,
      incomingAssets: [],
      incomingAssetAmounts: [],
      spendAssets: spendAssets,
      spendAssetAmounts: [0],
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: [],
        incomingAssetAmounts: [],
        spendAssets: spendAssets,
        spendAssetAmounts: [0],
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
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: [spendAsset],
      amounts: [spendAssetAmount],
    });

    // Seed the adapter with the spend asset amount to refund
    await spendAsset.transfer(mockGenericAdapter, spendAssetRebate);

    // Define spend assets and actual incoming assets
    const spendAssets = [spendAsset];
    const actualSpendAssetAmounts = [spendAssetAmount];
    const spendAssetAmounts = [spendAssetAmount.sub(spendAssetRebate)];

    // Swap the spend assets and receive the rebate
    const receipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      actualSpendAssetAmounts,
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
      spendAssets,
      spendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData: mockGenericSwapArgs({
        spendAssets,
        actualSpendAssetAmounts,
      }),
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets: [],
        incomingAssetAmounts: [],
        spendAssets,
        spendAssetAmounts,
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

    const swapArgs = { spendAssets, actualSpendAssetAmounts, incomingAssets, actualIncomingAssetAmounts };

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
      incomingAssetAmounts: actualIncomingAssetAmounts,
      spendAssets: spendAssets,
      spendAssetAmounts: actualSpendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        spendAssets: spendAssets,
        spendAssetAmounts: actualSpendAssetAmounts,
      }),
    );
  });

  it('handles a spend asset that is completely spent', async () => {
    const {
      mockGenericAdapter,
      tokens: { mln },
      deployment: { integrationManager, policyManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
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
    const actualSpendAssetAmounts = [utils.parseEther('1')];
    const incomingAssets = [denominationAsset];
    const actualIncomingAssetAmounts = [utils.parseEther('1')];

    const swapArgs = {
      spendAssets,
      actualSpendAssetAmounts,
      incomingAssets,
      actualIncomingAssetAmounts,
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
      incomingAssetAmounts: actualIncomingAssetAmounts,
      spendAssets: spendAssets,
      spendAssetAmounts: actualSpendAssetAmounts,
      selector: mockGenericSwapASelector,
      integrationData,
      vaultProxy,
    });

    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        spendAssets: spendAssets,
        spendAssetAmounts: actualSpendAssetAmounts,
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
    expect(incomingAssetBalancesCall).toEqual(actualIncomingAssetAmounts);
    const postTxGetTrackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(postTxGetTrackedAssetsCall).toEqual([denominationAsset.address]);
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
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      incomingAssets: [mln],
      actualIncomingAssetAmounts: [1],
    });

    expect(await vaultProxy.isTrackedAsset(mln)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(mln)).toBe(false);
  });
});

describe('SpendAssetsHandleType', () => {
  it.todo('does not approve or transfer a spend asset if type is `None`');

  it.todo('approves adapter with spend asset allowance if type is `Approve`');

  it.todo('transfers spend asset to adapter if type is `Transfer`');
});
