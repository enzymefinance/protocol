import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { deployVaultFactory } from '../transactions/deployVaultFactory';
import { createVaultInstance } from '../transactions/createVaultInstance';
import { CONTRACT_NAMES } from '~/tests/utils/new/constants';

describe('withdraw', () => {
  let environment, user, defaultTxOpts;
  let token;
  let factoryAddress;
  let authAddress;
  let vault;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user };
    user = environment.wallet.address;
    factoryAddress = await deployVaultFactory(environment);

    const tokenAddress = await deployToken(environment);
    token = getContract(
      environment,
      CONTRACT_NAMES.PREMINED_TOKEN,
      tokenAddress,
    );

    authAddress = await deployContract(
      environment,
      CONTRACT_NAMES.PERMISSIVE_AUTHORITY,
    );
  });

  beforeEach(async () => {
    const vaultAddress = await createVaultInstance(
      environment,
      factoryAddress,
      {
        hubAddress: authAddress,
      },
    );
    vault = getContract(environment, CONTRACT_NAMES.VAULT, vaultAddress);
  });

  it('withdraw token that is not present', async () => {
    await expect(
      vault.methods
        .withdraw(token.options.address, 100)
        .send(defaultTxOpts),
    ).rejects.toThrow();
  });

  it('withdraw available token', async () => {
    const amount = 100000;
    const amountInWalletPre = Number(
      await token.methods.balanceOf(user).call(),
    );
    await token.methods
      .transfer(vault.options.address, amount)
      .send(defaultTxOpts);

    let amountInVault = Number(
      await token.methods.balanceOf(vault.options.address).call(),
    );
    await expect(amountInVault).toBe(amount);

    await vault.methods
      .withdraw(token.options.address, amount)
      .send(defaultTxOpts);

    amountInVault = Number(
      await token.methods.balanceOf(vault.options.address).call(),
    );
    const amountInWalletPost = Number(
      await token.methods.balanceOf(user).call(),
    );

    await expect(amountInVault).toBe(0);
    await expect(amountInWalletPost).toBe(amountInWalletPre);
  });
});
