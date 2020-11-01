import {
  EthereumTestnetProvider,
  contract,
  Send,
  Contract,
  AddressLike,
  randomAddress,
} from '@crestproject/crestproject';
import { utils, BigNumber, BigNumberish } from 'ethers';
import {
  assertEvent,
  createNewFund,
  defaultTestDeployment,
} from '@melonproject/testutils';
import {
  encodeArgs,
  ReleaseStatusTypes,
  sighash,
} from '@melonproject/protocol';

// prettier-ignore
interface MockExternalContract extends Contract<MockExternalContract> {
  functionA: Send<() => void, MockExternalContract>
  functionB: Send<() => void, MockExternalContract>
  functionC: Send<(addr: AddressLike, num: BigNumberish) => void, MockExternalContract>
  'functionA()': Send<() => void, MockExternalContract>
  'functionB()': Send<() => void, MockExternalContract>
  'functionC(address addr, uint256 num)': Send<(addr: AddressLike, num: BigNumberish) => void, MockExternalContract>
}

// prettier-ignore
const MockExternalContract = contract<MockExternalContract>()`
  function functionA()
  function functionB()
  function functionC(address addr, uint256 num)
`;

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create a fund
  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;

  // Define a mock external contract to call with 2 functions
  const mockExternalContract = await MockExternalContract.mock(config.deployer);
  await mockExternalContract.functionA.returns(undefined);
  await mockExternalContract.functionB.returns(undefined);
  await mockExternalContract.functionC.returns(undefined);

  // Register one of the vault calls, but not the other
  const unregisteredVaultCallSelector = sighash(
    mockExternalContract.functionB.fragment,
  );
  const registeredVaultCallSelector = sighash(
    mockExternalContract.functionA.fragment,
  );
  const registeredVaultCallSelectorWithArgs = sighash(
    mockExternalContract.functionC.fragment,
  );
  await deployment.fundDeployer.registerVaultCalls(
    [mockExternalContract, mockExternalContract],
    [registeredVaultCallSelector, registeredVaultCallSelectorWithArgs],
  );

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    denominationAsset,
    fundOwner,
    mockExternalContract,
    registeredVaultCallSelector,
    registeredVaultCallSelectorWithArgs,
    unregisteredVaultCallSelector,
  };
}

describe('callOnExtension', () => {
  it.todo('write tests');

  it.todo('does not allow re-entrance');
});

describe('setOverridePause', () => {
  it('cannot be called by a random user', async () => {
    const {
      accounts: [randomUser],
      deployment: { fundDeployer },
      fundOwner,
      denominationAsset,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
    });

    await expect(
      comptrollerProxy.connect(randomUser).setOverridePause(true),
    ).rejects.toBeRevertedWith('Only fund owner callable');
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { fundDeployer },
      fundOwner,
      denominationAsset,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
    });

    const receipt = await comptrollerProxy.setOverridePause(true);
    // Assert event emitted
    assertEvent(receipt, 'OverridePauseSet', {
      overridePause: true,
    });

    // Assert state has been set
    const getOverridePauseCall = await comptrollerProxy.getOverridePause();
    expect(getOverridePauseCall).toBe(true);
  });
});

describe('vaultCallOnContract', () => {
  it.todo('cannot be called by a random user');

  it.todo('does not allow a call to an unregistered contract');

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      mockExternalContract,
      registeredVaultCallSelector,
      fundOwner,
      denominationAsset,
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
    });

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    // The call should fail
    await expect(
      comptrollerProxy.vaultCallOnContract(
        mockExternalContract,
        registeredVaultCallSelector,
        '0x',
      ),
    ).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.setOverridePause(true);

    // The call should then succeed
    await expect(
      comptrollerProxy.vaultCallOnContract(
        mockExternalContract,
        registeredVaultCallSelector,
        '0x',
      ),
    ).resolves.toBeReceipt();
  });

  it('only calls a registered function on an external contract, and not another function on the same contract', async () => {
    const {
      mockExternalContract,
      registeredVaultCallSelector,
      registeredVaultCallSelectorWithArgs,
      unregisteredVaultCallSelector,
      fundOwner,
      denominationAsset,
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
    });

    // The unregistered call should fail
    await expect(
      comptrollerProxy.vaultCallOnContract(
        mockExternalContract,
        unregisteredVaultCallSelector,
        '0x',
      ),
    ).rejects.toBeRevertedWith('Unregistered');

    // The registered call should succeed
    await expect(
      comptrollerProxy.vaultCallOnContract(
        mockExternalContract,
        registeredVaultCallSelector,
        '0x',
      ),
    ).resolves.toBeReceipt();

    expect(mockExternalContract.functionA).toHaveBeenCalledOnContract();

    // The registered call with args should succeed
    const addr = randomAddress();
    const num = BigNumber.from(utils.randomBytes(32));
    const callData = encodeArgs(['address', 'uint256'], [addr, num]);

    await expect(
      comptrollerProxy.vaultCallOnContract(
        mockExternalContract,
        registeredVaultCallSelectorWithArgs,
        callData,
      ),
    ).resolves.toBeReceipt();

    expect(mockExternalContract.functionC).toHaveBeenCalledOnContractWith(
      addr,
      num,
    );
  });
});
