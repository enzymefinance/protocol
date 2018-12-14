import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { deployVaultFactory } from '../transactions/deployVaultFactory';
import { createVaultInstance } from '../transactions/createVaultInstance';
import { Contracts } from '~/Contracts';

describe('withdraw', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    const tokenAddress = await deployToken(shared.env);
    shared.token = getContract(
      shared.env,
      Contracts.PreminedToken,
      tokenAddress,
    );
    shared.factoryAddress = await deployVaultFactory(shared.env);
    shared.authAddress = await deployContract(
      shared.env,
      Contracts.PermissiveAuthority,
    );
  });

  beforeEach(async () => {
    const vaultAddress = await createVaultInstance(
      shared.env,
      shared.factoryAddress,
      {
        hubAddress: shared.authAddress,
      },
    );
    shared.vault = getContract(shared.env, Contracts.Vault, vaultAddress);
  });

  it('withdraw token that is not present', async () => {
    await expect(
      shared.vault.methods
        .withdraw(shared.token.options.address, 100)
        .send({ from: shared.env.wallet.address }),
    ).rejects.toThrow();
  });

  it('withdraw available token', async () => {
    const amount = 100000;
    const amountInWalletPre = Number(
      await shared.token.methods.balanceOf(shared.env.wallet.address).call(),
    );
    await shared.token.methods
      .transfer(shared.vault.options.address, amount)
      .send({ from: shared.env.wallet.address });

    let amountInVault = Number(
      await shared.token.methods.balanceOf(shared.vault.options.address).call(),
    );
    await expect(amountInVault).toBe(amount);

    await shared.vault.methods
      .withdraw(shared.token.options.address, amount)
      .send({ from: shared.env.wallet.address });

    amountInVault = Number(
      await shared.token.methods.balanceOf(shared.vault.options.address).call(),
    );
    const amountInWalletPost = Number(
      await shared.token.methods.balanceOf(shared.env.wallet.address).call(),
    );

    await expect(amountInVault).toBe(0);
    await expect(amountInWalletPost).toBe(amountInWalletPre);
  });
});
