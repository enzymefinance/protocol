import { randomAddress } from '@enzymefinance/ethers';
import { ComptrollerLib, FundDeployer, ReleaseStatusTypes } from '@enzymefinance/protocol';
import { constants } from 'ethers';

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      comptrollerLib,
      dispatcher,
      feeManager,
      fundDeployer,
      integrationManager,
      policyManager,
      chainlinkPriceFeed,
      valueInterpreter,
      synthetixPriceFeed,
    } = fork.deployment;

    const routesCall = await comptrollerLib.getLibRoutes();
    expect(routesCall).toMatchFunctionOutput(comptrollerLib.getLibRoutes, {
      dispatcher_: dispatcher,
      feeManager_: feeManager,
      fundDeployer_: fundDeployer,
      integrationManager_: integrationManager,
      policyManager_: policyManager,
      primitivePriceFeed_: chainlinkPriceFeed,
      valueInterpreter_: valueInterpreter,
    });

    const getSynthetixAddressResolverCall = await comptrollerLib.getSynthetixAddressResolver();
    expect(getSynthetixAddressResolverCall).toMatchAddress(fork.config.synthetix.addressResolver);

    const getSynthetixPriceFeedCall = await comptrollerLib.getSynthetixPriceFeed();
    expect(getSynthetixPriceFeedCall).toMatchAddress(synthetixPriceFeed);

    // The following should be default values
    const denominationAssetCall = await comptrollerLib.getDenominationAsset();
    expect(denominationAssetCall).toMatchAddress(constants.AddressZero);

    const vaultProxyCall = await comptrollerLib.getVaultProxy();
    expect(vaultProxyCall).toMatchAddress(constants.AddressZero);
  });
});

describe('destruct', () => {
  it('cannot be non-delegatecalled', async () => {
    const mockFundDeployer = await FundDeployer.mock(fork.deployer);
    await mockFundDeployer.getReleaseStatus.returns(ReleaseStatusTypes.Live);

    const comptrollerLib = await ComptrollerLib.deploy(
      fork.deployer,
      randomAddress(),
      mockFundDeployer,
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
    );

    // Calling the ComptrollerLib directly should fail
    await expect(mockFundDeployer.forward(comptrollerLib.destruct)).rejects.toBeRevertedWith('Only delegate callable');
  });
});
