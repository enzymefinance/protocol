import { ethers } from 'ethers';
import {
  Contract,
  TransactionWrapper,
  DeploymentTransactionWrapper,
} from '~/framework/contract';
import { AddressLike } from '~/framework/types';

/**
 * A blacklist of assets to add to a fund's vault
 * @title AssetBlacklist Contract
 * @author Melon Council DAO <security@meloncoucil.io>
 */
export class AssetBlacklist extends Contract {
  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [
    'constructor(address _registry)',
    'event AddressesAdded(address policyManager, address[] items)',
    'event AddressesRemoved(address policyManager, address[] items)',
    'function REGISTRY() view returns (address)',
    'function getList(address _policyManager) view returns (address[])',
    'function isInList(address _policyManager, address _item) view returns (bool)',
    'function policyHook() view returns (uint8)',
    'function policyHookExecutionTime() view returns (uint8)',
    'function updateFundSettings(bytes)',
    'function addFundSettings(bytes _encodedSettings)',
    'function identifier() pure returns (string)',
    'function validateRule(bytes _encodedArgs) returns (bool)',
  ];

  /**
   * Deploy a new contract instance.
   *
   * @param signer The ethers.js signer instance to use.
   */
  public static deploy(signer: ethers.Signer, _registry: AddressLike) {
    return new DeploymentTransactionWrapper(this, signer, [_registry]);
  }

  /**
   * ```solidity
   * function REGISTRY() view returns (address)
   * ```
   *
   */
  REGISTRY!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * Get all addresses in a fund's list
   *
   * ```solidity
   * function getList(address) view returns (address[])
   * ```
   * @param _policyManager The fund's PolicyManager address
   * @returns An array of addresses
   *
   */
  getList!: (
    _policyManager: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string[]>;
  /**
   * Check if an address is in a fund's list
   *
   * ```solidity
   * function isInList(address,address) view returns (bool)
   * ```
   * @param _item The address to check against the list
   * @param _policyManager The fund's PolicyManager address
   * @returns True if the address is in the list
   *
   */
  isInList!: (
    _policyManager: AddressLike,
    _item: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * Get the PolicyHook for a policy
   *
   * ```solidity
   * function policyHook() view returns (uint8)
   * ```
   * @returns The PolicyHook
   *
   */
  policyHook!: ($$overrides?: ethers.CallOverrides) => Promise<number>;
  /**
   * Get the PolicyHookExecutionTime for a policy
   *
   * ```solidity
   * function policyHookExecutionTime() view returns (uint8)
   * ```
   * @returns The PolicyHookExecutionTime
   *
   */
  policyHookExecutionTime!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<number>;
  /**
   * Provides a constant string identifier for a policy
   *
   * ```solidity
   * function identifier() pure returns (string)
   * ```
   *
   */
  identifier!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * Disallowed by default
   *
   * Update the policy settings for a fund
   *
   * ```solidity
   * function updateFundSettings(bytes)
   * ```
   *
   */
  updateFundSettings!: (
    $$0: string | ethers.utils.BytesLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * A fund's PolicyManager is always the senderOnly called once, on PolicyManager.enablePolicies()
   *
   * Add the initial policy settings for a fund
   *
   * ```solidity
   * function addFundSettings(bytes)
   * ```
   * @param _encodedSettings Encoded settings to apply to a fund
   */
  addFundSettings!: (
    _encodedSettings: string | ethers.utils.BytesLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * A fund's PolicyManager is always the sender
   *
   * Apply the rule with specified paramters, in the context of a fund
   *
   * ```solidity
   * function validateRule(bytes) returns (bool)
   * ```
   * @param _encodedArgs Encoded args with which to validate the rule
   * @returns True if the rule passes
   *
   */
  validateRule!: (
    _encodedArgs: string | ethers.utils.BytesLike,
  ) => TransactionWrapper<ethers.Overrides>;
}
