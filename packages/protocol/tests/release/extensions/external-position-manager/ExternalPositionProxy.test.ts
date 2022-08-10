import { IExternalPositionProxy, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createMockExternalPosition, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const [fundOwner] = fork.accounts;

    const externalPositionManager = fork.deployment.externalPositionManager;
    const externalPositionFactory = fork.deployment.externalPositionFactory;

    const { vaultProxy, comptrollerProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'My Fund',
      fundOwner,
      signer: fundOwner,
    });

    const { externalPositionProxy, typeId } = await createMockExternalPosition({
      comptrollerProxy,
      defaultActionAmountsToTransfer: [],
      defaultActionAssetsToReceive: [],
      defaultActionAssetsToTransfer: [],
      deployer: fork.deployer,
      externalPositionFactory,
      externalPositionManager,
      fundOwner,
    });

    const externalPositionProxyInstance = new IExternalPositionProxy(externalPositionProxy, provider);

    expect(await externalPositionProxyInstance.getExternalPositionType()).toEqBigNumber(typeId);
    expect(await externalPositionProxyInstance.getVaultProxy()).toMatchAddress(vaultProxy.address);
  });
});
