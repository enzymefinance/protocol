import type { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionFactory,
  ExternalPositionManager,
  ITestStandardToken,
  sighash,
  VaultLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
let mockComptrollerProxy: any;
let mockVaultProxy: any;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  const deployer = fork.deployer;

  mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  mockVaultProxy = await VaultLib.mock(deployer);

  await mockVaultProxy.getAccessor.returns(mockComptrollerProxy);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);
});

describe('deploy', () => {
  it('works as expected', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);
    const externalPositionManager = await ExternalPositionManager.mock(fork.deployer);

    const [fundOwner] = fork.accounts;

    // Initialize fund and external position
    const { vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner as SignerWithAddress,
    });

    // TODO: Refactor to use generic external position mock contracts
    const compoundDebtPositionLib = fork.deployment.compoundDebtPositionLib;

    await externalPositionFactory.addPositionDeployers([externalPositionManager.address]);

    const initSelector = sighash(utils.FunctionFragment.fromString('init(bytes)'));

    const initArgs = encodeArgs(['bytes4', 'bytes'], [initSelector, '0x']);

    await externalPositionManager.forward(
      externalPositionFactory.deploy,
      vaultProxy,
      0,
      compoundDebtPositionLib.address,
      initArgs,
    );
  });

  it('reverts if the caller is not externalPositionManager', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);
    const externalPositionManager = await ExternalPositionManager.mock(fork.deployer);

    const [fundOwner] = fork.accounts;

    // Initialize fund and external position
    const { vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner as SignerWithAddress,
    });

    // TODO: Refactor to use generic external position mock contracts
    const compoundDebtPositionLib = fork.deployment.compoundDebtPositionLib;

    await externalPositionFactory.addPositionDeployers([externalPositionManager.address]);

    await expect(
      externalPositionFactory.deploy(vaultProxy, 0, compoundDebtPositionLib.address, '0x'),
    ).rejects.toBeRevertedWith('Only a position deployer can call this function');
  });
});

describe('addPositionDeployers', () => {
  it('works as expected', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);
    const externalPositionManager = fork.deployment.externalPositionManager;

    await externalPositionFactory.addPositionDeployers([externalPositionManager.address]);

    expect(await externalPositionFactory.isPositionDeployer(externalPositionManager.address)).toBeTruthy;
  });

  it('reverts if the position deployer has already been added', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);
    const externalPositionManager = fork.deployment.externalPositionManager;

    await externalPositionFactory.addPositionDeployers([externalPositionManager.address]);

    await expect(
      externalPositionFactory.addPositionDeployers([externalPositionManager.address]),
    ).rejects.toBeRevertedWith('Account is already a position deployer');
  });
});

describe('removePositionDeployers', () => {
  it('works as expected', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);
    const externalPositionManager = fork.deployment.externalPositionManager;

    await externalPositionFactory.addPositionDeployers([externalPositionManager.address]);
    await externalPositionFactory.removePositionDeployers([externalPositionManager.address]);

    expect(await externalPositionFactory.isPositionDeployer(externalPositionManager.address)).toBeFalsy;
  });

  it('reverts if the position deployer has not been added', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);
    const externalPositionManager = fork.deployment.externalPositionManager;

    await expect(
      externalPositionFactory.removePositionDeployers([externalPositionManager.address]),
    ).rejects.toBeRevertedWith('Account is not a position deployer');
  });
});

describe('addNewPositionTypes', () => {
  it('works as expected', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);

    const labelsBefore = await externalPositionFactory.getPositionTypeCounter();

    const testLabel = 'TEST_NEW_LABEL';

    await externalPositionFactory.addNewPositionTypes([testLabel]);

    const labelsAfter = await externalPositionFactory.getPositionTypeCounter();
    const labelRetrieved = await externalPositionFactory.getLabelForPositionType(labelsBefore);

    expect(labelsAfter.sub(labelsBefore)).toEqBigNumber('1');
    expect(labelRetrieved).toEqual(testLabel);
  });
});

describe('updatePositionTypeLabels', () => {
  it('works as expected', async () => {
    const externalPositionFactory = await ExternalPositionFactory.deploy(fork.deployer, fork.deployment.dispatcher);

    const testLabel = 'TEST_NEW_LABEL';

    await externalPositionFactory.addNewPositionTypes([testLabel]);

    const labelsBefore = await externalPositionFactory.getPositionTypeCounter();

    const testUpdatedLabel = 'TEST_UPDATED_LABEL';

    await externalPositionFactory.updatePositionTypeLabels([labelsBefore], [testUpdatedLabel]);

    const labelsAfter = await externalPositionFactory.getPositionTypeCounter();
    const labelRetrieved = await externalPositionFactory.getLabelForPositionType(labelsAfter);

    expect(labelsAfter.sub(labelsBefore)).toEqBigNumber('0');
    expect(labelRetrieved).toEqual(testUpdatedLabel);
  });
});
