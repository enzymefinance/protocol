import { ethers } from 'ethers';
import { Contract, TransactionWrapper, DeploymentTransactionWrapper } from '~/framework/contract';
import { AddressLike } from '~/framework/types';

export class MyContract extends Contract {
  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [];

  /**
   * Deploy a new contract instance.
   *
   * @param signer The ethers.js signer instance to use.
   */
  public static deploy(signer: ethers.Signer) {}
}
