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

  const maxConcentrationValue = utils.parseEther('.1'); // 10%

  // Mock the ValueInterpreter
  const mockValueInterpreter = await ValueInterpreter.mock(config.deployer);
  await mockValueInterpreter.calcLiveAssetValue.returns(0, false);

  // Deploy the standalone MaxConcentration policy
  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const maxConcentration = await MaxConcentration.deploy(
    config.deployer,
    EOAPolicyManager,
    mockValueInterpreter,
  );

  // Define mock fund values and calculate the limit of assetGav based on the maxConcentration
  const denominationAsset = deployment.tokens.weth;
  const totalGav = utils.parseEther('1');
  const assetGavLimit = BigNumber.from(totalGav)
    .mul(maxConcentrationValue)
    .div(utils.parseEther('1'));
  expect(assetGavLimit).toEqBigNumber(utils.parseEther('0.1'));

  // Only need an address for some contracts
  const vaultProxyAddress = randomAddress();

  // Mock the ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getVaultProxy.returns(vaultProxyAddress);
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
    accounts: remainingAccounts,
    assetGavLimit,
    denominationAsset,
    deployment,
    maxConcentration,
    maxConcentrationValue,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockValueInterpreter,
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
    constants.AddressZero,
    utils.randomBytes(4),
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

describe('activateForFund', () => {
  it.todo(
    'does not allow a misc asset with balance >maxConcentration in the fund trackedAssets',
  );

  it.todo('allows the denomination asset to have >maxConcentration');

  it.todo('allows a misc asset to have <maxConcentration');
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const { maxConcentration, maxConcentrationValue } = await provider.snapshot(
      snapshot,
    );

    const maxConcentrationConfig = await maxConcentrationArgs(
      maxConcentrationValue,
    );
    const addFundSettingsTx = maxConcentration.addFundSettings(
      randomAddress(),
      maxConcentrationConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      maxConcentration,
      maxConcentrationValue,
      EOAPolicyManager,
    } = await provider.snapshot(snapshot);

    const comptrollerProxy = randomAddress();

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
    const { maxConcentration } = await provider.snapshot(snapshot);

    const updateFundSettingsTx = maxConcentration.updateFundSettings(
      randomAddress(),
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
      snapshot,
    );

    // Empty args
    const postCoIArgs = await validateRulePostCoIArgs(
      constants.AddressZero,
      utils.randomBytes(4),
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
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

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
    } = await provider.snapshot(snapshot);

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
    } = await provider.snapshot(snapshot);

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
    } = await provider.snapshot(snapshot);

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
    } = await provider.snapshot(snapshot);

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
