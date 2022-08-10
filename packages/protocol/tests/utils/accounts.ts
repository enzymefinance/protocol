import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress, resolveAddress } from '@enzymefinance/ethers';
import { ITestStandardToken } from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';
import fs from 'fs-extra';
import path from 'path';

import { sendEthBySelfDestruct } from './helpers';

export async function impersonateContractSigner({
  contractAddress,
  ethSeeder,
  provider,
}: {
  contractAddress: AddressLike;
  ethSeeder: SignerWithAddress;
  provider: EthereumTestnetProvider;
}) {
  await sendEthBySelfDestruct({ recipient: contractAddress, signer: ethSeeder });

  return impersonateSigner({
    provider,
    signerAddress: contractAddress,
  });
}

export async function impersonateSigner({
  signerAddress,
  provider,
}: {
  signerAddress: AddressLike;
  provider: EthereumTestnetProvider;
}) {
  await provider.send('hardhat_impersonateAccount', [signerAddress]);

  return provider.getSignerWithAddress(resolveAddress(signerAddress));
}

export async function setAccountBalance({
  account,
  amount,
  overwrite = true,
  provider,
  token,
}: {
  account: AddressLike;
  amount: BigNumberish;
  overwrite?: boolean;
  provider: EthereumTestnetProvider;
  token: AddressLike;
}) {
  const resolvedAccount = resolveAddress(account).toLowerCase();
  const resolvedToken = resolveAddress(token).toLowerCase();

  const slotInfo = await findTokenBalanceStorageSlot(resolvedToken, provider);

  if (typeof slotInfo === 'undefined') {
    throw new Error(`Failed to find balance slot info for token ${resolvedToken}`);
  } else {
    // Source: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#mappings-and-dynamic-arrays
    const balanceSlot = slotInfo.isVyper
      ? utils.hexStripZeros(
          utils.keccak256(utils.defaultAbiCoder.encode(['uint256', 'address'], [slotInfo.slot, resolvedAccount])),
        )
      : utils.hexStripZeros(
          utils.keccak256(utils.defaultAbiCoder.encode(['address', 'uint256'], [resolvedAccount, slotInfo.slot])),
        );

    let encodedBalance: string;
    // Some tokens store their state on a different contract
    const address = slotInfo.storageAddress ?? resolveAddress(token);

    if (overwrite) {
      encodedBalance = utils.defaultAbiCoder.encode(['uint256'], [amount]);
    } else {
      // Get raw balance instead of balanceOf for a more accurate end result with rebasing tokens
      const balance = BigNumber.from(await provider.send('eth_getStorageAt', [address, balanceSlot]));
      encodedBalance = utils.defaultAbiCoder.encode(['uint256'], [balance.add(amount)]);
    }

    await provider.send('hardhat_setStorageAt', [address, balanceSlot, encodedBalance]);
    await provider.send('evm_mine', []);
  }
}

interface SlotInfo {
  slot: number;
  storageAddress?: string;
  isVyper: boolean;
}

export async function findTokenBalanceStorageSlot(
  token: AddressLike,
  provider: EthereumTestnetProvider,
): Promise<SlotInfo | undefined> {
  const resolvedToken = resolveAddress(token).toLowerCase();
  const fileURI = path.join(__dirname, 'data', 'tokenBalanceStorageSlots.json');
  const storedTokenSlotInfo: Record<string, SlotInfo | undefined> = fs.readJSONSync(fileURI);

  if (typeof storedTokenSlotInfo[resolvedToken] !== 'undefined') {
    return storedTokenSlotInfo[resolvedToken];
  }

  const tokenContract = new ITestStandardToken(resolvedToken, provider);
  const address = randomAddress();

  const probeValue = BigNumber.from('1234512345');
  const encodedBalance = utils.defaultAbiCoder.encode(['uint256'], [probeValue]);
  const prevBalance = await tokenContract.balanceOf(address);

  // Solidity
  for (let slot = 0; slot < 100; slot++) {
    const userBalanceSlot = utils.hexStripZeros(
      utils.keccak256(utils.defaultAbiCoder.encode(['address', 'uint256'], [address, slot])),
    );
    await provider.send('hardhat_setStorageAt', [resolvedToken, userBalanceSlot, encodedBalance]);
    const postBalance: BigNumber = await tokenContract.balanceOf(address);

    if (!prevBalance.eq(postBalance)) {
      storedTokenSlotInfo[resolvedToken] = { slot, isVyper: false };
      fs.outputJSONSync(fileURI, storedTokenSlotInfo);

      return storedTokenSlotInfo[resolvedToken];
    }
  }

  // Vyper
  for (let slot = 0; slot < 100; slot++) {
    const userBalanceSlot = utils.hexStripZeros(
      utils.keccak256(utils.defaultAbiCoder.encode(['uint256', 'address'], [slot, address])),
    );
    await provider.send('hardhat_setStorageAt', [resolvedToken, userBalanceSlot, encodedBalance]);
    const postBalance: BigNumber = await tokenContract.balanceOf(address);

    if (!prevBalance.eq(postBalance)) {
      storedTokenSlotInfo[resolvedToken] = { slot, isVyper: true };
      fs.outputJSONSync(fileURI, storedTokenSlotInfo);

      return storedTokenSlotInfo[resolvedToken];
    }
  }
}
