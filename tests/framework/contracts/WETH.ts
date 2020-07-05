import { ethers } from 'ethers';
import {
  Contract,
  TransactionWrapper,
  DeploymentTransactionWrapper,
} from '~/framework/contract';
import { AddressLike } from '~/framework/types';

export class WETH extends Contract {
  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [
    'event Approval(address indexed src, address indexed guy, uint256 wad)',
    'event Deposit(address indexed dst, uint256 wad)',
    'event Transfer(address indexed src, address indexed dst, uint256 wad)',
    'event Withdrawal(address indexed src, uint256 wad)',
    'function allowance(address, address) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function deposit() payable',
    'function withdraw(uint256 wad)',
    'function totalSupply() view returns (uint256)',
    'function approve(address guy, uint256 wad) returns (bool)',
    'function transfer(address dst, uint256 wad) returns (bool)',
    'function transferFrom(address src, address dst, uint256 wad) returns (bool)',
  ];

  /**
   * Deploy a new contract instance.
   *
   * @param signer The ethers.js signer instance to use.
   */
  public static deploy(signer: ethers.Signer) {
    return new DeploymentTransactionWrapper(this, signer);
  }

  /**
   * ```solidity
   * function allowance(address,address) view returns (uint256)
   * ```
   *
   */
  allowance!: (
    $$0: AddressLike,
    $$1: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function balanceOf(address) view returns (uint256)
   * ```
   *
   */
  balanceOf!: (
    $$0: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function decimals() view returns (uint8)
   * ```
   *
   */
  decimals!: ($$overrides?: ethers.CallOverrides) => Promise<number>;
  /**
   * ```solidity
   * function name() view returns (string)
   * ```
   *
   */
  name!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function symbol() view returns (string)
   * ```
   *
   */
  symbol!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function totalSupply() view returns (uint256)
   * ```
   *
   */
  totalSupply!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function deposit() payable
   * ```
   *
   */
  deposit!: () => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * ```solidity
   * function withdraw(uint256)
   * ```
   *
   */
  withdraw!: (wad: ethers.BigNumberish) => TransactionWrapper<ethers.Overrides>;
  /**
   * ```solidity
   * function approve(address,uint256) returns (bool)
   * ```
   *
   */
  approve!: (
    guy: AddressLike,
    wad: ethers.BigNumberish,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * ```solidity
   * function transfer(address,uint256) returns (bool)
   * ```
   *
   */
  transfer!: (
    dst: AddressLike,
    wad: ethers.BigNumberish,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * ```solidity
   * function transferFrom(address,address,uint256) returns (bool)
   * ```
   *
   */
  transferFrom!: (
    src: AddressLike,
    dst: AddressLike,
    wad: ethers.BigNumberish,
  ) => TransactionWrapper<ethers.Overrides>;
}
