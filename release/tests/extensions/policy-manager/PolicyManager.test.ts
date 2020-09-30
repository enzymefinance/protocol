import { utils } from 'ethers';
import {
  EthereumTestnetProvider,
  extractEvent,
} from '@crestproject/crestproject';
import { defaultTestDeployment } from '../../../';
import { IPolicy } from '../../../codegen/IPolicy';
import {
  buyShares,
  createNewFund,
  encodeArgs,
  mockGenericSwap,
  mockGenericSwapASelector,
  policyHookExecutionTimes,
  policyHooks,
  validateRulePreBuySharesArgs,
  validateRulePostBuySharesArgs,
  validateRulePreCoIArgs,
  validateRulePostCoIArgs,
} from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithMocks(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await provider.snapshot(snapshot);

  // Create mock policies
  const policies = [
    await IPolicy.mock(config.deployer),
    await IPolicy.mock(config.deployer),
    await IPolicy.mock(config.deployer),
    await IPolicy.mock(config.deployer),
  ];

  // Initialize mock policy return values
  await Promise.all<any>([
    policies.map((policy, i) => {
      return Promise.all([
        policy.identifier.returns('MOCK_'.concat((i + 1).toString())),
        policy.addFundSettings.returns(undefined),
        policy.validateRule.returns(true),
        i < 2
          ? policy.policyHook.returns(policyHooks.BuyShares)
          : policy.policyHook.returns(policyHooks.CallOnIntegration),
        i % 2 == 0
          ? policy.policyHookExecutionTime.returns(policyHookExecutionTimes.Pre)
          : policy.policyHookExecutionTime.returns(
              policyHookExecutionTimes.Post,
            ),
      ]);
    }),
  ]);
  const [
    mockPreBuySharesPolicy,
    mockPostBuySharesPolicy,
    mockPreCoIPolicy,
    mockPostCoIPolicy,
  ] = policies;

  // Register all mock policies and the mock generic adapter
  await deployment.policyManager.registerPolicies(policies);
  await deployment.integrationManager.registerAdapters([
    deployment.mockGenericAdapter,
  ]);

  return {
    accounts,
    deployment,
    config,
    policies: {
      mockPreBuySharesPolicy,
      mockPostBuySharesPolicy,
      mockPreCoIPolicy,
      mockPostCoIPolicy,
    },
  };
}

async function snapshotWithMocksAndFund(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config, policies } = await provider.snapshot(
    snapshotWithMocks,
  );

  const policySettingsData = [
    utils.randomBytes(10),
    '0x',
    utils.randomBytes(2),
    '0x',
  ];
  const policyManagerConfig = await encodeArgs(
    ['address[]', 'bytes[]'],
    [Object.values(policies), policySettingsData],
  );
  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;
  const { comptrollerProxy, newFundTx, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
    policyManagerConfig,
  });

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      newFundTx,
      vaultProxy,
    },
    policies,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: {
        adapterBlacklist,
        adapterWhitelist,
        assetBlacklist,
        assetWhitelist,
        fundDeployer,
        maxConcentration,
        policyManager,
        investorWhitelist,
      },
    } = await provider.snapshot(snapshot);

    const getRegisteredPoliciesCall = policyManager.getRegisteredPolicies();
    await expect(getRegisteredPoliciesCall).resolves.toMatchObject([
      adapterBlacklist.address,
      adapterWhitelist.address,
      assetBlacklist.address,
      assetWhitelist.address,
      maxConcentration.address,
      investorWhitelist.address,
    ]);

    const getOwnerCall = policyManager.getOwner();
    await expect(getOwnerCall).resolves.toBe(await fundDeployer.getOwner());
  });
});

describe('setConfigForFund', () => {
  it.todo('does not allow unequal policies and settingsData array lengths');

  it.todo('does not allow duplicate policies');

  it.todo('does not allow unregistered policies');

  it('successfully configures PolicyManager state and fires events', async () => {
    const {
      accounts: { 0: fundOwner },
      deployment: {
        fundDeployer,
        policyManager,
        tokens: { weth },
      },
      policies: {
        mockPreBuySharesPolicy,
        mockPostBuySharesPolicy,
        mockPreCoIPolicy,
        mockPostCoIPolicy,
      },
    } = await provider.snapshot(snapshotWithMocks);

    const policies = [
      mockPreBuySharesPolicy,
      mockPostBuySharesPolicy,
      mockPreCoIPolicy,
      mockPostCoIPolicy,
    ];
    const policiesSettingsData = [
      utils.randomBytes(10),
      '0x',
      '0x',
      utils.randomBytes(2),
    ];
    const policyManagerConfig = await encodeArgs(
      ['address[]', 'bytes[]'],
      [policies, policiesSettingsData],
    );
    const { comptrollerProxy, newFundTx } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: weth,
      policyManagerConfig,
    });

    // Assert state for fund
    const getEnabledPoliciesForFundCall = policyManager.getEnabledPoliciesForFund(
      comptrollerProxy,
    );
    await expect(getEnabledPoliciesForFundCall).resolves.toMatchObject([
      policies[0].address,
      policies[1].address,
      policies[2].address,
      policies[3].address,
    ]);

    // Assert addFundSettings was called on each policy with its settingsData
    for (let i = 0; i < policies.length; i++) {
      await expect(
        policies[i].addFundSettings.ref,
      ).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        policiesSettingsData[i],
      );
    }

    // Assert PolicyEnabledForFund events
    const policyEnabledForFundEvent = policyManager.abi.getEvent(
      'PolicyEnabledForFund',
    );
    const events = extractEvent(await newFundTx, policyEnabledForFundEvent);
    expect(events.length).toBe(policies.length);
    for (let i = 0; i < policies.length; i++) {
      expect(events[i].args).toMatchObject({
        comptrollerProxy: comptrollerProxy.address,
        policy: policies[i].address,
        settingsData: utils.hexlify(policiesSettingsData[i]),
      });
    }
  });
});

describe('state getters', () => {
  it.todo('determine tests');
});

describe('deregisterPolicies', () => {
  it.todo('can only be called by the owner of the FundDeployer contract');

  it.todo('does not allow empty _policies param');

  it.todo('does not allow an unregistered policy');

  it.todo(
    'successfully de-registers multiple policies and fires one event per policy',
  );
});

describe('registerPolicies', () => {
  it.todo('can only be called by the owner of the FundDeployer contract');

  it.todo('does not allow empty _policies param');

  it.todo('does not allow an already registered policy');

  it.todo(
    'successfully registers multiple policies and fires one event per policy',
  );
});

describe('disablePolicyForFund', () => {
  it.todo('does not allow disabled policy');

  it.todo('does not allow non-BuyShares policy');

  it.todo('successfully disables a BuyShares policy');
});

describe('validatePolicies', () => {
  it('correctly handles a BuyShares PolicyHook', async () => {
    const {
      accounts: { 0: buyer },
      fund: { comptrollerProxy, denominationAsset },
      policies: {
        mockPreBuySharesPolicy,
        mockPostBuySharesPolicy,
        mockPreCoIPolicy,
        mockPostCoIPolicy,
      },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    const investmentAmount = utils.parseEther('2');
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert validateRule called on correct policies
    expect(
      mockPreBuySharesPolicy.validateRule.ref,
    ).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      validateRulePreBuySharesArgs(buyer, investmentAmount, investmentAmount),
    );
    expect(
      mockPostBuySharesPolicy.validateRule.ref,
    ).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      validateRulePostBuySharesArgs(buyer, investmentAmount, investmentAmount),
    );

    // Assert validateRule not called on other policies
    expect(mockPreCoIPolicy.validateRule.ref).not.toHaveBeenCalledOnContract();
    expect(mockPostCoIPolicy.validateRule.ref).not.toHaveBeenCalledOnContract();
  });

  it('correctly handles a CallOnIntegration PolicyHook', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        tokens: { dai, mln, weth },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      policies: {
        mockPreBuySharesPolicy,
        mockPostBuySharesPolicy,
        mockPreCoIPolicy,
        mockPostCoIPolicy,
      },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    // Define complex spend and incoming asset values to ensure correct data passed to PolicyManager
    const spendAssets = [weth, dai];
    const spendAssetAmounts = [utils.parseEther('1'), utils.parseEther('1')];
    const incomingAssets = [dai, mln];
    const minIncomingAssetAmounts = [1234, 5678];

    // Since `mockGenericSwap` seeds funds by sending directly to a vault,
    // the incoming assets are not yet tracked, meaning the final token balance
    // will be the reported incoming asset amount
    // (rather than the diff in token balances from start to finish)
    const actualIncomingAssetAmounts = [
      utils.parseEther('10'),
      utils.parseEther('2'),
    ];

    await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts,
      seedFund: true,
    });

    // Assert validateRule called on correct policies
    expect(mockPreCoIPolicy.validateRule.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      validateRulePreCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        minIncomingAssetAmounts,
        spendAssets,
        spendAssetAmounts,
      ),
    );

    // Outgoing assets are the spend assets that are not also incoming assets
    const outgoingAssets = [weth];
    const outgoingAssetAmounts = [utils.parseEther('1')];

    expect(mockPostCoIPolicy.validateRule.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      validateRulePostCoIArgs(
        mockGenericSwapASelector,
        mockGenericAdapter,
        incomingAssets,
        actualIncomingAssetAmounts,
        outgoingAssets,
        outgoingAssetAmounts,
      ),
    );

    // Assert validateRule not called on other policies
    expect(
      mockPreBuySharesPolicy.validateRule.ref,
    ).not.toHaveBeenCalledOnContract();
    expect(
      mockPostBuySharesPolicy.validateRule.ref,
    ).not.toHaveBeenCalledOnContract();
  });

  it('reverts if return value is false', async () => {
    const {
      deployment: { integrationManager, mockGenericAdapter },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      policies: { mockPreCoIPolicy },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    // Set policy to return validateRule as false
    await mockPreCoIPolicy.validateRule.returns(false);

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
    });
    await expect(swapTx).rejects.toBeRevertedWith('Rule evaluated to false');
  });
});
