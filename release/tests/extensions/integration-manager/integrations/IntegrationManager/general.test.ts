import {
  EthereumTestnetProvider,
  extractEvent,
} from '@crestproject/crestproject';
import { utils, constants } from 'ethers';
import { defaultTestDeployment } from '../../../../..';
import { createNewFund } from '../../../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: {
        integrationManager,
        fundDeployer,
        policyManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const getFundDeployerCall = integrationManager.getFundDeployer();
    await expect(getFundDeployerCall).resolves.toBe(fundDeployer.address);

    const getPolicyManagerCall = integrationManager.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const getValueInterpreterCall = integrationManager.getValueInterpreter();
    await expect(getValueInterpreterCall).resolves.toBe(
      valueInterpreter.address,
    );
  });
});

describe('deregisterAdapters', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    const deregisterAdaptersTx = integrationManager
      .connect(randomUser)
      .deregisterAdapters([]);
    await expect(deregisterAdaptersTx).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow an empty _adapters value', async () => {
    const {
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    const deregisterAdaptersTx = integrationManager.deregisterAdapters([]);
    await expect(deregisterAdaptersTx).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { integrationManager, kyberAdapter, chaiAdapter },
    } = await provider.snapshot(snapshot);

    const preAdapters = await integrationManager.getRegisteredAdapters();
    expect(preAdapters).toEqual(
      expect.arrayContaining([kyberAdapter.address, chaiAdapter.address]),
    );

    const deregisterAdaptersTx = integrationManager.deregisterAdapters([
      kyberAdapter,
      chaiAdapter,
    ]);
    const events = extractEvent(
      await deregisterAdaptersTx,
      'AdapterDeregistered',
    );
    expect(events.length).toBe(2);
    expect(events[0].args).toMatchObject({
      0: kyberAdapter.address,
      1: expect.objectContaining({
        hash: utils.id('KYBER_NETWORK'),
      }),
    });
    expect(events[1].args).toMatchObject({
      0: chaiAdapter.address,
      1: expect.objectContaining({
        hash: utils.id('CHAI'),
      }),
    });

    const postAdapters = await integrationManager.getRegisteredAdapters();
    expect(postAdapters.includes(kyberAdapter.address)).toBe(false);
    expect(postAdapters.includes(chaiAdapter.address)).toBe(false);
    expect(postAdapters.length).toBe(preAdapters.length - 2);
  });

  it('does not allow an unregistered adapter', async () => {
    const {
      deployment: { integrationManager, kyberAdapter },
    } = await provider.snapshot(snapshot);

    let deregisterAdaptersTx = integrationManager.deregisterAdapters([
      kyberAdapter,
    ]);
    await expect(deregisterAdaptersTx).resolves.toBeReceipt();
    deregisterAdaptersTx = integrationManager.deregisterAdapters([
      kyberAdapter,
    ]);
    await expect(deregisterAdaptersTx).rejects.toBeRevertedWith(
      'adapter is not registered',
    );
  });
});

describe('registerAdapters', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    const registerAdaptersTx = integrationManager
      .connect(randomUser)
      .registerAdapters([]);
    await expect(registerAdaptersTx).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow an empty _adapters value', async () => {
    const {
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    let registerAdaptersTx = integrationManager.registerAdapters([]);
    await expect(registerAdaptersTx).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
    registerAdaptersTx = integrationManager.registerAdapters([
      constants.AddressZero,
    ]);
    await expect(registerAdaptersTx).rejects.toBeRevertedWith(
      'adapter cannot be empty',
    );
  });

  it('does not allow a registered adapter', async () => {
    const {
      deployment: { integrationManager, kyberAdapter, chaiAdapter },
    } = await provider.snapshot(snapshot);

    const registerAdaptersTx = integrationManager.registerAdapters([
      kyberAdapter,
      chaiAdapter,
    ]);
    await expect(registerAdaptersTx).rejects.toBeRevertedWith(
      'adapter already registered',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { integrationManager, kyberAdapter, chaiAdapter },
    } = await provider.snapshot(snapshot);

    const deregisterAdaptersTx = integrationManager.deregisterAdapters([
      kyberAdapter,
      chaiAdapter,
    ]);
    await expect(deregisterAdaptersTx).resolves.toBeReceipt();

    const registerAdaptersTx = integrationManager.registerAdapters([
      kyberAdapter,
      chaiAdapter,
    ]);
    const events = extractEvent(await registerAdaptersTx, 'AdapterRegistered');
    expect(events.length).toBe(2);
    expect(events[0].args).toMatchObject({
      0: kyberAdapter.address,
      1: expect.objectContaining({
        hash: utils.id('KYBER_NETWORK'),
      }),
    });
    expect(events[1].args).toMatchObject({
      0: chaiAdapter.address,
      1: expect.objectContaining({
        hash: utils.id('CHAI'),
      }),
    });

    const getRegisteredAdaptersCall = integrationManager.getRegisteredAdapters();
    await expect(getRegisteredAdaptersCall).resolves.toEqual(
      expect.arrayContaining([kyberAdapter.address, chaiAdapter.address]),
    );
  });
});
