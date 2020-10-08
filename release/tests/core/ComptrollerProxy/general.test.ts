import {
  EthereumTestnetProvider,
  contract,
  Send,
  Contract,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../';
import { createNewFund, releaseStatusTypes, sighash } from '../../utils';

// prettier-ignore
interface MockExternalContract extends Contract<MockExternalContract> {
  functionA: Send<() => void, MockExternalContract>
  functionB: Send<() => void, MockExternalContract>
  'functionA()': Send<() => void, MockExternalContract>
  'functionB()': Send<() => void, MockExternalContract>
}

// prettier-ignore
const MockExternalContract = contract.fromSignatures<MockExternalContract>`
  function functionA()
  function functionB()
`;

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create a fund
  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;
  const { comptrollerProxy, newFundTx, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  // Define a mock external contract to call with 2 functions
  const mockExternalContract = await MockExternalContract.mock(config.deployer);
  await mockExternalContract.functionA.returns(undefined);
  await mockExternalContract.functionB.returns(undefined);

  // Register one of the vault calls, but not the other
  const unregisteredVaultCallSelector = sighash(
    mockExternalContract.functionB.fragment,
  );
  const registeredVaultCallSelector = sighash(
    mockExternalContract.functionA.fragment,
  );
  await deployment.fundDeployer.registerVaultCalls(
    [mockExternalContract.address],
    [registeredVaultCallSelector],
  );

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      newFundTx,
      vaultProxy,
    },
    mockExternalContract,
    registeredVaultCallSelector,
    unregisteredVaultCallSelector,
  };
}

describe('callOnExtension', () => {
  it.todo('write tests');
});

describe('setOverridePause', () => {
  it('cannot be called by a random user', async () => {
    const {
      accounts: { 0: randomUser },
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshot);

    const badSetOverridePauseTx = comptrollerProxy
      .connect(randomUser)
      .setOverridePause(true);
    await expect(badSetOverridePauseTx).rejects.toBeRevertedWith(
      'Only the fund owner can call this function',
    );
  });

  it('does not allow the current value', async () => {
    const {
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshot);

    const badSetOverridePauseTx = comptrollerProxy.setOverridePause(false);
    await expect(badSetOverridePauseTx).rejects.toBeRevertedWith(
      '_overridePause is already the set value',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshot);

    const setOverridePauseTx = comptrollerProxy.setOverridePause(true);
    await expect(setOverridePauseTx).resolves.toBeReceipt();

    // Assert state has been set
    const getOverridePauseCall = comptrollerProxy.getOverridePause();
    await expect(getOverridePauseCall).resolves.toBe(true);

    // Assert event emitted
    await assertEvent(setOverridePauseTx, 'OverridePauseSet', {
      overridePause: true,
    });
  });
});

describe('vaultCallOnContract', () => {
  it.todo('cannot be called by a random user');

  it.todo('does not allow a call to an unregistered contract');

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      deployment: { fundDeployer },
      fund: { comptrollerProxy },
      mockExternalContract,
      registeredVaultCallSelector,
    } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(releaseStatusTypes.Paused);

    // The call should fail
    const badRegisteredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      registeredVaultCallSelector,
      '0x',
    );
    await expect(badRegisteredCall).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.setOverridePause(true);

    // The call should then succeed
    const goodRegisteredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      registeredVaultCallSelector,
      '0x',
    );
    await expect(goodRegisteredCall).resolves.toBeReceipt();
  });

  it('only calls a registered function on an external contract, and not another function on the same contract', async () => {
    const {
      fund: { comptrollerProxy },
      mockExternalContract,
      registeredVaultCallSelector,
      unregisteredVaultCallSelector,
    } = await provider.snapshot(snapshot);

    // The unregistered call should fail
    const unregisteredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      unregisteredVaultCallSelector,
      '0x',
    );
    await expect(unregisteredCall).rejects.toBeRevertedWith(
      'not a registered call',
    );

    // The registered call should succeed
    const registeredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      registeredVaultCallSelector,
      '0x',
    );
    await expect(registeredCall).resolves.toBeReceipt();
    expect(mockExternalContract.functionA).toHaveBeenCalledOnContract();
  });
});
