import { IExternalPositionProxy, StandardToken } from '@enzymefinance/protocol';

import {
  createNewFund,
  createMockExternalPosition,
  deployProtocolFixture,
  ProtocolDeployment,
} from '@enzymefinance/testutils';

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
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'My Fund',
    });

    const { externalPositionProxy, typeId } = await createMockExternalPosition({
      comptrollerProxy,
      externalPositionManager,
      externalPositionFactory,
      fundOwner,
      defaultActionAssetsToTransfer: [],
      defaultActionAmountsToTransfer: [],
      defaultActionAssetsToReceive: [],
      deployer: fork.deployer,
    });

    const externalPositionProxyInstance = new IExternalPositionProxy(externalPositionProxy, provider);

    expect(await externalPositionProxyInstance.getExternalPositionType()).toEqBigNumber(typeId);
    expect(await externalPositionProxyInstance.getVaultProxy()).toMatchAddress(vaultProxy.address);
  });
});
