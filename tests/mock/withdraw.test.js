import { deploy, fetchContract } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES } from '~/tests/utils/constants';

describe('withdraw', () => {
  let user, defaultTxOpts;
  let token, auth, vault, factory;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    factory = await deploy(CONTRACT_NAMES.VAULT_FACTORY);

    token = await deploy(
      CONTRACT_NAMES.PREMINED_TOKEN,
      ['ABC', 18, 'Alphabet']
    );

    auth = await deploy(CONTRACT_NAMES.PERMISSIVE_AUTHORITY);
  });

  beforeEach(async () => {
    const res = await factory.methods.createInstance(
      auth.options.address
    ).send(defaultTxOpts);
    const vaultAddress = res.events.NewInstance.returnValues.instance;
    vault = fetchContract(CONTRACT_NAMES.VAULT, vaultAddress);
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
    expect(amountInVault).toBe(amount);

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
