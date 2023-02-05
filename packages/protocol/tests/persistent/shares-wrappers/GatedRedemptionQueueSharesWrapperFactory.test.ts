import { randomAddress } from '@enzymefinance/ethers';
import type {
  GatedRedemptionQueueSharesWrapperFactory,
  GatedRedemptionQueueSharesWrapperRedemptionWindowConfig,
  VaultLib,
} from '@enzymefinance/protocol';
import { ITestStandardToken, ONE_DAY_IN_SECONDS, TEN_PERCENT_IN_WEI } from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  createNewFund,
  deployGatedRedemptionQueueSharesWrapper,
  deployProtocolFixture,
} from '@enzymefinance/testutils';

const randomAddressValue = randomAddress();

let fork: ProtocolDeployment;

let sharesWrapperFactory: GatedRedemptionQueueSharesWrapperFactory;
let fundOwner: SignerWithAddress, manager: SignerWithAddress, randomUser: SignerWithAddress;
let vaultProxy: VaultLib;
let redemptionAsset: ITestStandardToken;
let redemptionWindowConfig: GatedRedemptionQueueSharesWrapperRedemptionWindowConfig;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  [fundOwner, manager, randomUser] = fork.accounts;
  sharesWrapperFactory = fork.deployment.gatedRedemptionQueueSharesWrapperFactory;

  const denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

  // Deploy a new fund
  const newFundRes = await createNewFund({
    denominationAsset,
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  vaultProxy = newFundRes.vaultProxy;

  // Define config
  redemptionAsset = denominationAsset;
  redemptionWindowConfig = {
    firstWindowStart: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS * 10,
    frequency: ONE_DAY_IN_SECONDS * 30,
    duration: ONE_DAY_IN_SECONDS * 7,
    relativeSharesCap: TEN_PERCENT_IN_WEI,
  };
});

describe('deploy', () => {
  it('does not allow an invalid vault', async () => {
    await expect(
      deployGatedRedemptionQueueSharesWrapper({
        signer: randomUser,
        sharesWrapperFactory,
        vaultProxy: randomAddress(),
        managers: [manager],
        redemptionAsset,
        useDepositApprovals: true,
        useRedemptionApprovals: true,
        useTransferApprovals: true,
        redemptionWindowConfig,
      }),
    ).rejects.toBeRevertedWith('Invalid vault');
  });

  it('happy path', async () => {
    // The deployment event is tested in this helper
    const { receipt, sharesWrapper } = await deployGatedRedemptionQueueSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      managers: [manager],
      redemptionAsset,
      useDepositApprovals: true,
      useRedemptionApprovals: true,
      useTransferApprovals: true,
      redemptionWindowConfig,
    });

    // Initial wrapper state
    expect(await sharesWrapper.getVaultProxy()).toMatchAddress(vaultProxy);
    expect(await sharesWrapper.isManager(manager)).toBe(true);
    expect(await sharesWrapper.getRedemptionAsset()).toMatchAddress(redemptionAsset);
    expect(await sharesWrapper.depositApprovalsAreUsed()).toBe(true);
    expect(await sharesWrapper.redemptionApprovalsAreUsed()).toBe(true);
    expect(await sharesWrapper.transferApprovalsAreUsed()).toBe(true);
    expect(await sharesWrapper.getRedemptionWindowConfig()).toMatchFunctionOutput(
      sharesWrapper.getRedemptionWindowConfig,
      redemptionWindowConfig,
    );

    expect(receipt).toMatchInlineGasSnapshot('358709');
  });
});

describe('setImplementation', () => {
  it('does not allow a random caller', async () => {
    await expect(
      sharesWrapperFactory.connect(randomUser).setImplementation(randomAddressValue),
    ).rejects.toBeRevertedWith('Unauthorized');
  });

  it('happy path', async () => {
    const nextImplementationAddress = randomAddressValue;

    const receipt = await sharesWrapperFactory.connect(fork.deployer).setImplementation(nextImplementationAddress);

    expect(await sharesWrapperFactory.implementation()).toMatchAddress(nextImplementationAddress);

    assertEvent(receipt, 'ImplementationSet', {
      implementation: nextImplementationAddress,
    });
  });
});
