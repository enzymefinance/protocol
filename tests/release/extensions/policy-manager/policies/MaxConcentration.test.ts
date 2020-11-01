import { BigNumber, BigNumberish, constants, utils } from 'ethers';
import {
  AddressLike,
  EthereumTestnetProvider,
  MockContract,
  randomAddress,
} from '@crestproject/crestproject';
import {
  StandardToken,
  ComptrollerLib,
  MaxConcentration,
  ValueInterpreter,
  maxConcentrationArgs,
  PolicyHook,
  validateRulePostCoIArgs,
} from '@melonproject/protocol';
import { defaultTestDeployment, assertEvent } from '@melonproject/testutils';

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
  const maxConcentrationConfig = maxConcentrationArgs(maxConcentrationValue);
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
  incomingAsset: StandardToken;
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
  const postCoIArgs = validateRulePostCoIArgs({
    adapter: constants.AddressZero,
    selector: utils.randomBytes(4),
    incomingAssets: [incomingAsset],
    incomingAssetAmounts: [],
    outgoingAssets: [],
    outgoingAssetAmounts: [],
  });

  return maxConcentration.validateRule
    .args(
      mockComptrollerProxy,
      await mockComptrollerProxy.getVaultProxy(),
      PolicyHook.PostCallOnIntegration,
      postCoIArgs,
    )
    .call();
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, maxConcentration },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = await maxConcentration.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const implementedHooksCall = await maxConcentration.implementedHooks();
    expect(implementedHooksCall).toMatchObject([
      PolicyHook.PostCallOnIntegration,
    ]);
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

    const maxConcentrationConfig = maxConcentrationArgs(maxConcentrationValue);

    await expect(
      maxConcentration.addFundSettings(randomAddress(), maxConcentrationConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      maxConcentration,
      maxConcentrationValue,
      EOAPolicyManager,
    } = await provider.snapshot(snapshot);

    const comptrollerProxy = randomAddress();

    const maxConcentrationConfig = maxConcentrationArgs(maxConcentrationValue);
    const receipt = await maxConcentration
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, maxConcentrationConfig);

    // Assert the MaxConcentrationSet event was emitted
    assertEvent(receipt, 'MaxConcentrationSet', {
      comptrollerProxy: comptrollerProxy,
      value: maxConcentrationValue,
    });

    // maxConcentration should be set for comptrollerProxy
    const getMaxConcentrationForFundCall = await maxConcentration.getMaxConcentrationForFund(
      comptrollerProxy,
    );
    expect(getMaxConcentrationForFundCall).toEqBigNumber(maxConcentrationValue);
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { maxConcentration } = await provider.snapshot(snapshot);

    await expect(
      maxConcentration.updateFundSettings(
        randomAddress(),
        randomAddress(),
        '0x',
      ),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

describe('validateRule', () => {
  it('returns true if there are no incoming assets', async () => {
    const { maxConcentration, mockComptrollerProxy } = await provider.snapshot(
      snapshot,
    );

    // Empty args
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [],
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleCall = await maxConcentration.validateRule
      .args(
        mockComptrollerProxy,
        await mockComptrollerProxy.getVaultProxy(),
        PolicyHook.PostCallOnIntegration,
        postCoIArgs,
      )
      .call();

    expect(validateRuleCall).toBeTruthy();
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
      incomingAsset,
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

    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
    });

    expect(validateRuleCall).toBeTruthy();
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
    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav: BigNumber.from(assetGavLimit).add(1),
    });

    expect(validateRuleCall).toBeFalsy();
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
    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav: BigNumber.from(assetGavLimit).add(1),
    });

    expect(validateRuleCall).toBeTruthy();
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

    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      vaultProxyAddress,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
      assetValueIsValid: false,
    });

    expect(validateRuleCall).toBeFalsy();
  });
});
