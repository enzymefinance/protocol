import * as path from 'path';
import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { deploy, getContract } from '~/utils/solidity';
import { deployToken } from '~/contracts/dependencies/token';
import { createVaultInstance, deployVaultFactory } from '..';
import { Contracts } from '~/Contracts';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.env = getGlobalEnvironment();
  const tokenAddress = await deployToken();
  shared.token = getContract(Contracts.PreminedToken, tokenAddress);
  shared.factoryAddress = await deployVaultFactory();
  shared.authAddress = await deploy(
    path.join('dependencies', 'PermissiveAuthority'),
  );
});

beforeEach(async () => {
  const vaultAddress = await createVaultInstance(shared.factoryAddress, {
    hubAddress: shared.authAddress,
  });
  shared.vault = getContract(Contracts.Vault, vaultAddress);
});

test('withdraw token that is not present', async () => {
  await expect(
    shared.vault.methods
      .withdraw(shared.token.options.address, 100)
      .send({ from: shared.env.wallet.address }),
  ).rejects.toThrow();
}, 10000);

test('withdraw available token', async () => {
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
