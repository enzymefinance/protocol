import { randomAddress } from '@enzymefinance/ethers';
import { ReleaseStatusTypes, StandardToken } from '@enzymefinance/protocol';
import {
  createMigratedFundConfig,
  createNewFund,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockPolicies,
  createFundDeployer,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { constants } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [signer],
    deployment: {
      fundDeployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      valueInterpreter,
      vaultLib,
    },
    config,
  } = await deployProtocolFixture();

  // Get mock fees and mock policies data with which to configure funds
  const feeManagerConfigData = await generateFeeManagerConfigWithMockFees({
    deployer,
    feeManager,
  });

  const policyManagerConfigData = await generatePolicyManagerConfigWithMockPolicies({
    deployer,
    policyManager,
  });

  // TODO: use an alternative deployment that has not yet set the ReleaseStatus to Live?
  const nonLiveFundDeployer = await createFundDeployer({
    deployer,
    chainlinkPriceFeed,
    dispatcher,
    feeManager,
    integrationManager,
    policyManager,
    synthetixPriceFeed,
    synthetixAddressResolverAddress: config.synthetix.addressResolver,
    valueInterpreter,
    vaultLib,
    setReleaseStatusLive: false,
    setOnDispatcher: false,
  });

  const denominationAsset = new StandardToken(config.weth, deployer);

  return {
    signer,
    dispatcher,
    fundDeployer,
    denominationAsset,
    feeManagerConfigData,
    policyManagerConfigData,
    nonLiveFundDeployer,
  };
}

describe('createNewFund', () => {
  it('does not allow an empty _fundOwner', async () => {
    const { fundDeployer } = await provider.snapshot(snapshot);

    await expect(
      fundDeployer.createNewFund(constants.AddressZero, '', randomAddress(), 0, constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith(' _owner cannot be empty');
  });

  it('does not allow an empty _denominationAsset', async () => {
    const { fundDeployer } = await provider.snapshot(snapshot);

    await expect(
      fundDeployer.createNewFund(randomAddress(), '', constants.AddressZero, 0, constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith(' _denominationAsset cannot be empty');
  });

  it('does not allow the release status to be Paused', async () => {
    const { denominationAsset, fundDeployer } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    await expect(
      fundDeployer.createNewFund(randomAddress(), '', denominationAsset, 0, constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith('Release is not Live');
  });

  it('does not allow the release status to be PreLaunch', async () => {
    const { denominationAsset, dispatcher, nonLiveFundDeployer } = await provider.snapshot(snapshot);

    // Set the FundDeployer as the current release, but do not set release status to Live
    await dispatcher.setCurrentFundDeployer(nonLiveFundDeployer);

    await expect(
      nonLiveFundDeployer.createNewFund(
        randomAddress(),
        '',
        denominationAsset,
        0,
        constants.HashZero,
        constants.HashZero,
      ),
    ).rejects.toBeRevertedWith('Release is not Live');
  });

  it('correctly handles valid call', async () => {
    const { fundDeployer, denominationAsset, signer } = await provider.snapshot(snapshot);

    const fundOwner = randomAddress();
    const fundName = 'My Fund';

    // TODO: Fix this. Gets the wrong return values for the newly deployed contracts.
    // Get expected return values via .call() before executing tx
    // const createNewFundCall = fundDeployer.createNewFund
    //   .args(fundOwner, fundName, denominationAsset, '0x', '0x')
    //   .call();

    // Send tx. Events are asserted within helper.
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      fundOwner,
      fundName,
      denominationAsset,
    });

    // Assert return values
    // await expect(createNewFundCall).resolves.toMatchObject([
    //   comptrollerProxy.address,
    //   vaultProxy.address,
    // ]);

    // Assert expected calls
    expect(comptrollerProxy.activate).toHaveBeenCalledOnContractWith(vaultProxy, false);
  });
});

describe('createMigratedFundConfig', () => {
  it('does not allow an empty _denominationAsset', async () => {
    const { fundDeployer } = await provider.snapshot(snapshot);

    await expect(
      fundDeployer.createMigratedFundConfig(constants.AddressZero, 0, constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith('_denominationAsset cannot be empty');
  });

  it('does not allow the release to be paused', async () => {
    const { denominationAsset, fundDeployer } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    await expect(
      fundDeployer.createMigratedFundConfig(denominationAsset, 0, constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith('Release is not Live');
  });

  it('does not allow the release status to be PreLaunch', async () => {
    const { denominationAsset, dispatcher, nonLiveFundDeployer } = await provider.snapshot(snapshot);

    // Set the FundDeployer as the current release, but do not set release status to Live
    await dispatcher.setCurrentFundDeployer(nonLiveFundDeployer);

    await expect(
      nonLiveFundDeployer.createMigratedFundConfig(denominationAsset, 0, constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith('Release is not Live');
  });

  it('correctly handles valid call', async () => {
    const { denominationAsset, fundDeployer, signer, feeManagerConfigData, policyManagerConfigData } =
      await provider.snapshot(snapshot);

    // TODO: Call first to check return value and assert below (after resolved above)

    // Send tx. Events are validated in the helper
    const { comptrollerProxy } = await createMigratedFundConfig({
      signer,
      fundDeployer,
      denominationAsset,
      feeManagerConfigData,
      policyManagerConfigData,
    });

    // Assert FundDeployer state has been set
    const getPendingComptrollerProxyCreatorCall = await fundDeployer.getPendingComptrollerProxyCreator(
      comptrollerProxy,
    );

    expect(getPendingComptrollerProxyCreatorCall).toMatchAddress(signer);

    // Assert expected calls
    expect(comptrollerProxy.activate).not.toHaveBeenCalledOnContract();
  });
});
