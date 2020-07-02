import { ethers } from 'ethers';
import {
  Contract,
  TransactionWrapper,
  AddressLike,
  DeploymentTransactionWrapper,
} from './..';

/**
 * Router for communication between componentsHas one or more Spokes
 * @title Hub Contract
 * @author Melon Council DAO <security@meloncoucil.io>
 */
export class Hub extends Contract {
  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [
    'constructor(address _registry, address _fundFactory, address _manager, string _name)',
    'event FeeManagerSet(address feeManager)',
    'event PolicyManagerSet(address policyManager)',
    'event SharesSet(address shares)',
    'event StatusUpdated(uint8 indexed status)',
    'event VaultSet(address vault)',
    'function FUND_FACTORY() view returns (address)',
    'function MANAGER() view returns (address)',
    'function NAME() view returns (string)',
    'function REGISTRY() view returns (address)',
    'function feeManager() view returns (address)',
    'function policyManager() view returns (address)',
    'function shares() view returns (address)',
    'function status() view returns (uint8)',
    'function vault() view returns (address)',
    'function initializeFund()',
    'function setFeeManager(address _feeManager)',
    'function setPolicyManager(address _policyManager)',
    'function setShares(address _shares)',
    'function setVault(address _vault)',
    'function shutDownFund()',
  ];

  /**
   * Deploy a new contract instance.
   *
   * @param bytecode The bytecode to deploy the contract with.
   * @param signer The ethers.js signer instance to use.
   */
  public static deploy(
    bytecode: string,
    signer: ethers.Signer,
    _registry: AddressLike,
    _fundFactory: AddressLike,
    _manager: AddressLike,
    _name: string,
  ) {
    return new DeploymentTransactionWrapper(this, bytecode, signer, [
      _registry,
      _fundFactory,
      _manager,
      _name,
    ]);
  }

  /**
   * ```solidity
   * function FUND_FACTORY() view returns (address)
   * ```
   *
   */
  FUND_FACTORY!: ($$overrides?: ethers.CallOverrides) => Promise<AddressLike>;
  /**
   * ```solidity
   * function MANAGER() view returns (address)
   * ```
   *
   */
  MANAGER!: ($$overrides?: ethers.CallOverrides) => Promise<AddressLike>;
  /**
   * ```solidity
   * function NAME() view returns (string)
   * ```
   *
   */
  NAME!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function REGISTRY() view returns (address)
   * ```
   *
   */
  REGISTRY!: ($$overrides?: ethers.CallOverrides) => Promise<AddressLike>;
  /**
   * ```solidity
   * function feeManager() view returns (address)
   * ```
   *
   */
  feeManager!: ($$overrides?: ethers.CallOverrides) => Promise<AddressLike>;
  /**
   * ```solidity
   * function policyManager() view returns (address)
   * ```
   *
   */
  policyManager!: ($$overrides?: ethers.CallOverrides) => Promise<AddressLike>;
  /**
   * ```solidity
   * function shares() view returns (address)
   * ```
   *
   */
  shares!: ($$overrides?: ethers.CallOverrides) => Promise<AddressLike>;
  /**
   * ```solidity
   * function status() view returns (uint8)
   * ```
   *
   */
  status!: ($$overrides?: ethers.CallOverrides) => Promise<number>;
  /**
   * ```solidity
   * function vault() view returns (address)
   * ```
   *
   */
  vault!: ($$overrides?: ethers.CallOverrides) => Promise<AddressLike>;
  /**
   * Initializes a fund (activates it)
   *
   * ```solidity
   * function initializeFund()
   * ```
   *
   */
  initializeFund!: () => TransactionWrapper<ethers.Overrides>;
  /**
   * Sets the feeManager address for the fund
   *
   * ```solidity
   * function setFeeManager(address)
   * ```
   * @param _feeManager The FeeManager component for the fund
   */
  setFeeManager!: (
    _feeManager: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Sets the policyManager address for the fund
   *
   * ```solidity
   * function setPolicyManager(address)
   * ```
   * @param _policyManager The PolicyManager component for the fund
   */
  setPolicyManager!: (
    _policyManager: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Sets the shares address for the fund
   *
   * ```solidity
   * function setShares(address)
   * ```
   * @param _shares The Shares component for the fund
   */
  setShares!: (_shares: AddressLike) => TransactionWrapper<ethers.Overrides>;
  /**
   * Sets the vault address for the fund
   *
   * ```solidity
   * function setVault(address)
   * ```
   * @param _vault The Vault component for the fund
   */
  setVault!: (_vault: AddressLike) => TransactionWrapper<ethers.Overrides>;
  /**
   * Shut down the fund
   *
   * ```solidity
   * function shutDownFund()
   * ```
   *
   */
  shutDownFund!: () => TransactionWrapper<ethers.Overrides>;
}
