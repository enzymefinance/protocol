import { randomAddress } from '@enzymefinance/ethers';
import { encodeArgs, ReleaseStatusTypes, sighash, StandardToken } from '@enzymefinance/protocol';
import {
  assertEvent,
  callOnExtension,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('callOnExtension', () => {
  it('can not call a random extension', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(
      callOnExtension({
        signer: fundOwner,
        comptrollerProxy,
        extension: randomAddress(),
        actionId: 0,
      }),
    ).rejects.toBeRevertedWith('_extension invalid');
  });

  it('does not allow a paused release, unless overridePause is set', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    await expect(
      callOnExtension({
        signer: fundOwner,
        comptrollerProxy,
        extension: randomAddress(),
        actionId: 0,
      }),
    ).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.setOverridePause(true);

    await expect(
      callOnExtension({
        signer: fundOwner,
        comptrollerProxy,
        extension: randomAddress(),
        actionId: 0,
      }),
    ).rejects.toBeRevertedWith('_extension invalid');
  });

  it.todo('does not allow re-entrance');
});

describe('permissionedVaultAction', () => {
  it.todo('onlyNotPaused test');

  it.todo('access control tests');

  it.todo('RemoveTrackedAsset: does not allow the denomination asset');
});

describe('setOverridePause', () => {
  it('cannot be called by a random user', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner, randomUser] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(comptrollerProxy.connect(randomUser).setOverridePause(true)).rejects.toBeRevertedWith(
      'Only fund owner callable',
    );
  });

  it('correctly handles valid call', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
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
  it('cannot be called by a random user', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner, randomUser] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Use the first allowed vault call
    const [contract, selector, dataHash] = Object.values(fork.config.vaultCalls)[0];

    await expect(
      comptrollerProxy.connect(randomUser).vaultCallOnContract(contract, selector, dataHash),
    ).rejects.toBeRevertedWith('Only fund owner callable');
  });

  it('correctly calls only an allowed vault call', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, provider);
    const asset = weth;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: weth,
    });

    // Register a call for a token approval to a specific address
    const contract = asset;
    const functionSighash = sighash(utils.FunctionFragment.fromString('approve(address,uint)'));
    const spender = randomAddress();
    const validEncodedArgs = encodeArgs(['address', 'uint'], [spender, constants.MaxUint256]);
    await fundDeployer.registerVaultCalls([asset], [functionSighash], [utils.keccak256(validEncodedArgs)]);

    // Attempting to approve a different spender or a different amount should fail
    await expect(
      comptrollerProxy.vaultCallOnContract(
        contract,
        functionSighash,
        encodeArgs(['address', 'uint'], [randomAddress(), constants.MaxUint256]),
      ),
    ).rejects.toBeRevertedWith('Not allowed');
    await expect(
      comptrollerProxy.vaultCallOnContract(contract, functionSighash, encodeArgs(['address', 'uint'], [spender, 5])),
    ).rejects.toBeRevertedWith('Not allowed');

    // The registered call with valid encoded args should succeed
    await comptrollerProxy.vaultCallOnContract(
      contract,
      functionSighash,
      encodeArgs(['address', 'uint'], [spender, constants.MaxUint256]),
    );

    // The allowance should be reflected on the asset
    expect(await asset.allowance(vaultProxy, spender)).toEqBigNumber(constants.MaxUint256);
  });
});
