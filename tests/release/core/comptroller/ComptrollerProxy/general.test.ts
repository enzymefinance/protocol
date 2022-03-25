import { randomAddress } from '@enzymefinance/ethers';
import { encodeArgs, sighash, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { callOnExtension, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
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
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    await expect(
      callOnExtension({
        actionId: 0,
        comptrollerProxy,
        extension: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('_extension invalid');
  });

  it.todo('does not allow re-entrance');
});

describe('permissionedVaultAction', () => {
  it.todo('access control tests');

  it.todo('RemoveTrackedAsset: does not allow the denomination asset');
});

describe('vaultCallOnContract', () => {
  it('cannot be called by a random user', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner, randomUser] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    await expect(
      comptrollerProxy.connect(randomUser).vaultCallOnContract(constants.AddressZero, utils.randomBytes(4), '0x'),
    ).rejects.toBeRevertedWith('Only fund owner callable');
  });

  it('correctly calls only an allowed vault call', async () => {
    const { fundDeployer } = fork.deployment;
    const [fundOwner] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, provider);
    const asset = weth;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer,
      fundOwner,
      signer: fundOwner,
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
