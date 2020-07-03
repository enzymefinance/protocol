import { ethers } from 'ethers';
import { getArtifact } from '~/framework';

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
