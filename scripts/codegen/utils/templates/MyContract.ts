import { ethers } from 'ethers';

export class MyContract extends Contract {

  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [];

  /**
   * Deploy a new contract instance.
   *
   * @param bytecode The bytecode to deploy the contract with.
   * @param signer The ethers.js signer instance to use.
   */
  public static deploy(bytecode: string, signer: ethers.Signer) {}
}
