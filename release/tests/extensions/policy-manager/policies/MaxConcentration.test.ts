import { BigNumber, BigNumberish, constants, utils } from 'ethers';
import {
  AddressLike,
  EthereumTestnetProvider,
  MockContract,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { IERC20 } from '../../../../codegen/IERC20';
import {
  ComptrollerLib,
  MaxConcentration,
  ValueInterpreter,
} from '../../../../utils/contracts';
import {
  policyHooks,
  policyHookExecutionTimes,
  maxConcentrationArgs,
  validateRulePostCoIArgs,
} from '../../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
    maxConcentrationValue: utils.parseEther('.1'), // 10%
  };
}

async function snapshotWithStandalonePolicy(provider: EthereumTestnetProvider) {
  const {
    accounts,
    config,
    deployment,
    maxConcentrationValue,
  } = await provider.snapshot(snapshot);

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const maxConcentration = await MaxConcentration.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    maxConcentration,
    maxConcentrationValue,
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
  };
}

async function snapshotWithStandalonePolicyAndMocks(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    config,
    deployment,
    EOAPolicyManager,
    maxConcentration,
    maxConcentrationValue,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  // Define mock fund values and calculate the limit of assetGav based on the maxConcentration
  const denominationAsset = deployment.tokens.weth;
  const totalGav = utils.parseEther('1');
  const assetGavLimit = BigNumber.from(totalGav)
    .mul(maxConcentrationValue)
    .div(utils.parseEther('1'));
  expect(assetGavLimit).toEqBigNumber(utils.parseEther('0.1'));

  // Only need an address for several contracts
  const derivativePriceFeedAddress = randomAddress();
  const primitivePriceFeedAddress = randomAddress();
  const vaultProxyAddress = randomAddress();

  // Mock the ValueInterpreter
  const mockValueInterpreter = await ValueInterpreter.mock(config.deployer);
  await mockValueInterpreter.calcLiveAssetValue.returns(0, false);

  // Mock the ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getVaultProxy.returns(vaultProxyAddress);
  await mockComptrollerProxy.getRoutes.returns(
    derivativePriceFeedAddress,
    randomAddress(),
    randomAddress(),
    randomAddress(),
    randomAddress(),
    primitivePriceFeedAddress,
    mockValueInterpreter,
  );
  await mockComptrollerProxy.calcGav.returns(totalGav);
  await mockComptrollerProxy.getDenominationAsset.returns(denominationAsset);

  // Add policy settings for ComptrollerProxy
  const maxConcentrationConfig = await maxConcentrationArgs(
    maxConcentrationValue,
  );
  await maxConcentration
    .connect(EOAPolicyManager)
    .addFundSettings(mockComptrollerProxy, maxConcentrationConfig);

  return {
    accounts,
    assetGavLimit,
    denominationAsset,
    deployment,
    derivativePriceFeedAddress,
    maxConcentration,
    maxConcentrationValue,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockValueInterpreter,
    primitivePriceFeedAddress,
    vaultProxyAddress,
  };
}

async function mockValuesAndValidateRule({
  mockComptrollerProxy,
  vaultProxyAddress,
  mockValueInterpreter,
  maxConcentration,
  incomingAsset,
  incomingAssetGav,
  assetValueIsValid = true,
}: {
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  vaultProxyAddress: AddressLike;
  mockValueInterpreter: MockContract<ValueInterpreter>;
  maxConcentration: MaxConcentration;
  incomingAsset: IERC20;
  incomingAssetGav: BigNumberish;
  assetValueIsValid?: boolean;
}) {
  // Send assetGavLimit of the incomingAsset to vault
  await incomingAsset.transfer(vaultProxyAddress, incomingAssetGav);

  // Set value interpreter to return hardcoded amount
  await mockValueInterpreter.calcLiveAssetValue.returns(
    incomingAssetGav.toString(),
    assetValueIsValid,
  );

  // Only the incoming assets arg matters for this policy
  const postCoIArgs = await validateRulePostCoIArgs(
    utils.randomBytes(4),
    constants.AddressZero,
    [incomingAsset],
    [],
    [],
    [],
  );

  return maxConcentration.validateRule
    .args(mockComptrollerProxy, postCoIArgs)
    .call();
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, maxConcentration },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = maxConcentration.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const policyHookCall = maxConcentration.policyHook();
    await expect(policyHookCall).resolves.toBe(policyHooks.CallOnIntegration);

    const policyHookExecutionTimeCall = maxConcentration.policyHookExecutionTime();
    await expect(policyHookExecutionTimeCall).resolves.toBe(
      policyHookExecutionTimes.Post,
    );
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      comptrollerProxy,
      maxConcentration,
      maxConcentrationValue,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const maxConcentrationConfig = await maxConcentrationArgs(
      maxConcentrationValue,
    );
    const addFundSettingsTx = maxConcentration.addFundSettings(
      comptrollerProxy,
      maxConcentrationConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      comptrollerProxy,
      maxConcentration,
      maxConcentrationValue,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const maxConcentrationConfig = await maxConcentrationArgs(
      maxConcentrationValue,
    );
    const addFundSettingsTx = maxConcentration
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, maxConcentrationConfig);
    await expect(addFundSettingsTx).resolves.toBeReceipt();

    // maxConcentration should be set for comptrollerProxy
    const getMaxConcentrationForFundCall = maxConcentration.getMaxConcentrationForFund(
      comptrollerProxy,
    );
    await expect(getMaxConcentrationForFundCall).resolves.toEqBigNumber(
      maxConcentrationValue,
    );

    // Assert the MaxConcentrationSet event was emitted
    await assertEvent(addFundSettingsTx, 'MaxConcentrationSet', {
      comptrollerProxy: comptrollerProxy,
      value: maxConcentrationValue,
    });
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { comptrollerProxy, maxConcentration } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const updateFundSettingsTx = maxConcentration.updateFundSettings(
      comptrollerProxy,
      '0x',
    );
    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns true if there are no incoming assets', async () => {
    const { maxConcentration, mockComptrollerProxy } = await provider.snapshot(
      snapshotWithStandalonePolicyAndMocks,
    );

    // Empty args
    const postCoIArgs = await validateRulePostCoIArgs(
      utils.randomBytes(4),
      constants.AddressZero,
      [],
      [],
      [],
      [],
    );

    const validateRuleCall = maxConcentration.validateRule
      .args(mockComptrollerProxy, postCoIArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('properly queries live rates', async () => {
    const {
      deployment: {
        tokens: { mln: incomingAsset },
      },
      assetGavLimit: incomingAssetGav,
      denominationAsset,
      derivativePriceFeedAddress,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      primitivePriceFeedAddress,
      vaultProxyAddress,
    } = await provider.snapshot(snapshotWithStandalonePolicyAndMocks);

    await mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
    });

    expect(
      mockValueInterpreter.calcLiveAssetValue,
    ).toHaveBeenCalledOnContractWith(
      primitivePriceFeedAddress,
      derivativePriceFeedAddress,
      incomingAsset.address,
      incomingAssetGav,
      denominationAsset,
    );
  });

  it('returns true if the incoming asset gav is exactly the threshold amount', async () => {
    const {
      deployment: {
        tokens: { mln: incomingAsset },
      },
      assetGavLimit: incomingAssetGav,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      vaultProxyAddress,
    } = await provider.snapshot(snapshotWithStandalonePolicyAndMocks);

    const validateRuleCall = mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
    });

    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('returns false if the incoming asset gav is slightly over the threshold amount', async () => {
    const {
      deployment: {
        tokens: { mln: incomingAsset },
      },
      assetGavLimit,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      vaultProxyAddress,
    } = await provider.snapshot(snapshotWithStandalonePolicyAndMocks);

    // Increase incoming asset balance to be 1 wei over the limit
    const validateRuleCall = mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav: BigNumber.from(assetGavLimit).add(1),
    });

    await expect(validateRuleCall).resolves.toBeFalsy();
  });

  it('returns true if the incoming asset is the denomination asset', async () => {
    const {
      assetGavLimit,
      denominationAsset: incomingAsset,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      vaultProxyAddress,
    } = await provider.snapshot(snapshotWithStandalonePolicyAndMocks);

    // Increase incoming asset balance to be 1 wei over the limit
    const validateRuleCall = mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav: BigNumber.from(assetGavLimit).add(1),
    });

    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('returns false if the asset value lookup is invalid', async () => {
    const {
      deployment: {
        tokens: { mln: incomingAsset },
      },
      assetGavLimit: incomingAssetGav,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      vaultProxyAddress,
    } = await provider.snapshot(snapshotWithStandalonePolicyAndMocks);

    const validateRuleCall = mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
      assetValueIsValid: false,
    });

    await expect(validateRuleCall).resolves.toBeFalsy();
  });
});
