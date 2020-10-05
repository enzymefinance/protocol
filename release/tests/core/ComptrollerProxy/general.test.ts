import {
  EthereumTestnetProvider,
  contract,
  Send,
  Contract,
} from '@crestproject/crestproject';
import { defaultTestDeployment } from '../../../';
import { createNewFund, sighash } from '../../utils';

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

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithFund(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await provider.snapshot(snapshot);

  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;
  const { comptrollerProxy, newFundTx, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

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
  };
}

describe('vaultCallOnContract', () => {
  it.todo('does not allow a call from a random user');

  it.todo('does not allow a call to an unregistered contract');

  it('only calls a registered function on an external contract, and not another function on the same contract', async () => {
    const {
      config: { deployer },
      deployment: { fundDeployer },
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshotWithFund);

    // Define a mock external contract to call with 2 functions
    const mockExternalContract = await MockExternalContract.mock(deployer);
    await mockExternalContract.functionA.returns(undefined);
    await mockExternalContract.functionB.returns(undefined);

    const unregisteredFunctionSelector = sighash(
      mockExternalContract.functionB.fragment,
    );
    const registeredFunctionSelector = sighash(
      mockExternalContract.functionA.fragment,
    );

    // Register one of the calls
    await fundDeployer.registerVaultCalls(
      [mockExternalContract.address],
      [registeredFunctionSelector],
    );

    // The unregistered call should fail
    const unregisteredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      unregisteredFunctionSelector,
      '0x',
    );
    await expect(unregisteredCall).rejects.toBeRevertedWith(
      'not a registered call',
    );

    // The registered call should succeed
    const registeredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      registeredFunctionSelector,
      '0x',
    );
    await expect(registeredCall).resolves.toBeReceipt();
    expect(mockExternalContract.functionA).toHaveBeenCalledOnContract();
  });
});
