import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, FundDeployer, ProtocolFeeTracker, VaultLib } from '@enzymefinance/protocol';
import { StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createFundDeployer, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

let fork: ProtocolDeployment;

describe('unhappy paths', () => {
  beforeEach(async () => {
    fork = await deployProtocolFixture();
  });

  // No empty _fundOwner validated by VaultLib.init()
  // No bad _denominationAsset validated by ComptrollerLib.init()

  it('does not allow ownership handoff to not be incomplete', async () => {
    const {
      assetFinalityResolver,
      externalPositionManager,
      dispatcher,
      feeManager,
      gasRelayPaymasterFactory,
      integrationManager,
      policyManager,
      valueInterpreter,
      vaultLib,
    } = fork.deployment;
    const nonLiveFundDeployer = await createFundDeployer({
      assetFinalityResolver,
      deployer: fork.deployer,
      dispatcher,
      externalPositionManager,
      feeManager,
      gasRelayPaymasterFactory,
      integrationManager,
      policyManager,
      // Do NOT set the release live
      setOnDispatcher: true,

      setReleaseLive: false,
      valueInterpreter,
      vaultLib, // Do set as the current release on the Dispatcher
    });

    await expect(
      nonLiveFundDeployer.createNewFund(
        randomAddress(),
        '',
        fork.config.weth,
        0,
        constants.HashZero,
        constants.HashZero,
      ),
    ).rejects.toBeRevertedWith('Release is not yet live');
  });
});

describe('happy paths', () => {
  describe('No extension config', () => {
    let fundDeployer: FundDeployer, protocolFeeTracker: ProtocolFeeTracker;
    let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
    let fundName: string, fundOwner: AddressLike, denominationAsset: StandardToken, sharesActionTimelock: BigNumber;

    beforeAll(async () => {
      fork = await deployProtocolFixture();

      const [signer] = fork.accounts;
      fundDeployer = fork.deployment.fundDeployer;
      protocolFeeTracker = fork.deployment.protocolFeeTracker;

      fundOwner = randomAddress();
      fundName = 'My Fund';
      denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
      sharesActionTimelock = BigNumber.from(123);

      // Note that events are asserted within helper
      const fundRes = await createNewFund({
        denominationAsset,
        fundDeployer,
        fundName,
        fundOwner,
        sharesActionTimelock,
        signer,
      });

      comptrollerProxy = fundRes.comptrollerProxy;
      vaultProxy = fundRes.vaultProxy;
    });

    it('correctly calls the lifecycle setVaultProxy() function', async () => {
      expect(comptrollerProxy.setVaultProxy).toHaveBeenCalledOnContractWith(vaultProxy);
    });

    it('correctly calls the lifecycle activate() function', async () => {
      expect(comptrollerProxy.activate).toHaveBeenCalledOnContractWith(false);
    });

    it('correctly calls the ProtocolFeeTracker to initialize the protocol fee', async () => {
      expect(protocolFeeTracker.initializeForVault).toHaveBeenCalledOnContractWith(vaultProxy);
    });

    it('sets the correct ComptrollerProxy state values', async () => {
      expect(await comptrollerProxy.getDenominationAsset()).toMatchAddress(denominationAsset);
      expect(await comptrollerProxy.getSharesActionTimelock()).toEqBigNumber(sharesActionTimelock);
      expect(await comptrollerProxy.getVaultProxy()).toMatchAddress(vaultProxy);
    });

    it('sets the correct VaultProxy state values', async () => {
      expect(await vaultProxy.getAccessor()).toMatchAddress(comptrollerProxy);
      expect(await vaultProxy.getOwner()).toMatchAddress(fundOwner);
      expect(await vaultProxy.name()).toEqual(fundName);
    });
  });
});
