import { ethers } from 'ethers';
import {
  Contract,
  TransactionWrapper,
  DeploymentTransactionWrapper,
} from '~/framework/contract';
import { AddressLike } from '~/framework/types';

/**
 * Creates fund routes and links them together
 * @title FundFactory Contract
 * @author Melon Council DAO <security@meloncoucil.io>
 */
export class FundFactory extends Contract {
  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [
    'constructor(address _feeManagerFactory, address _sharesFactory, address _vaultFactory, address _policyManagerFactory, address _registry)',
    'event AmguPaid(address indexed payer, uint256 totalAmguPaidInEth, uint256 amguChargableGas)',
    'event FeeManagerCreated(address indexed manager, address indexed hub, address feeManager)',
    'event FundNameTaken(address indexed manager, string name)',
    'event FundSetupBegun(address indexed manager, address hub)',
    'event FundSetupCompleted(address indexed manager, address indexed hub)',
    'event HubCreated(address indexed manager, address hub)',
    'event IncentivePaid(address indexed payer, uint256 incentiveAmount)',
    'event PolicyManagerCreated(address indexed manager, address indexed hub, address policyManager)',
    'event SharesCreated(address indexed manager, address indexed hub, address shares)',
    'event VaultCreated(address indexed manager, address indexed hub, address vault)',
    'function REGISTRY() view returns (address)',
    'function feeManagerFactory() view returns (address)',
    'function managerToPendingFundHub(address) view returns (address)',
    'function managerToPendingFundSettings(address) view returns (address denominationAsset)',
    'function policyManagerFactory() view returns (address)',
    'function sharesFactory() view returns (address)',
    'function vaultFactory() view returns (address)',
    'function beginFundSetup(string _name, address[] _fees, uint256[] _feeRates, uint256[] _feePeriods, address[] _policies, bytes[] _policySettings, address[] _adapters, address _denominationAsset)',
    'function createFeeManagerFor(address _manager) payable',
    'function createFeeManager() payable',
    'function createPolicyManagerFor(address _manager) payable',
    'function createPolicyManager() payable',
    'function createSharesFor(address _manager) payable',
    'function createShares() payable',
    'function createVaultFor(address _manager) payable',
    'function createVault() payable',
    'function completeFundSetupFor(address _manager) payable',
    'function completeFundSetup() payable',
    'function isValidFundName(string _name) pure returns (bool)',
  ];

  /**
   * Deploy a new contract instance.
   *
   * @param signer The ethers.js signer instance to use.
   */
  public static deploy(
    signer: ethers.Signer,
    _feeManagerFactory: AddressLike,
    _sharesFactory: AddressLike,
    _vaultFactory: AddressLike,
    _policyManagerFactory: AddressLike,
    _registry: AddressLike,
  ) {
    return new DeploymentTransactionWrapper(this, signer, [
      _feeManagerFactory,
      _sharesFactory,
      _vaultFactory,
      _policyManagerFactory,
      _registry,
    ]);
  }

  /**
   * ```solidity
   * function REGISTRY() view returns (address)
   * ```
   *
   */
  REGISTRY!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function feeManagerFactory() view returns (address)
   * ```
   *
   */
  feeManagerFactory!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function managerToPendingFundHub(address) view returns (address)
   * ```
   *
   */
  managerToPendingFundHub!: (
    $$0: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string>;
  /**
   * ```solidity
   * function managerToPendingFundSettings(address) view returns (address)
   * ```
   *
   */
  managerToPendingFundSettings!: (
    $$0: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string>;
  /**
   * ```solidity
   * function policyManagerFactory() view returns (address)
   * ```
   *
   */
  policyManagerFactory!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string>;
  /**
   * ```solidity
   * function sharesFactory() view returns (address)
   * ```
   *
   */
  sharesFactory!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function vaultFactory() view returns (address)
   * ```
   *
   */
  vaultFactory!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * Needed to provide clean url slugs for the frontend
   *
   * Check whether a string has only valid characters for use in a fund name
   *
   * ```solidity
   * function isValidFundName(string) pure returns (bool)
   * ```
   * @param _name The fund name string to check
   * @returns True if the name is valid for use in a fund
   *
   */
  isValidFundName!: (
    _name: string,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * The first action in setting up a fund, where the parameters of a fund are defined
   *
   * ```solidity
   * function beginFundSetup(string,address[],uint256[],uint256[],address[],bytes[],address[],address)
   * ```
   * @param _adapters The integration adapters to use to interact with external protocols
   * @param _denominationAsset The asset in which to denominate share price and measure fund performance
   * @param _feePeriods The period to use in each Fee contracts
   * @param _feeRates The rates to use with each Fee contracts
   * @param _fees The Fee contract addresses to use in the fund
   * @param _name The fund's name
   */
  beginFundSetup!: (
    _name: string,
    _fees: AddressLike[],
    _feeRates: ethers.BigNumberish[],
    _feePeriods: ethers.BigNumberish[],
    _policies: AddressLike[],
    _policySettings: string | ethers.utils.BytesLike,
    _adapters: AddressLike[],
    _denominationAsset: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Creates a FeeManager component for a particular fund manager's fund
   *
   * ```solidity
   * function createFeeManagerFor(address) payable
   * ```
   * @param _manager The fund manager for whom the component should be created
   */
  createFeeManagerFor!: (
    _manager: AddressLike,
  ) => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Creates a FeeManager component for the sender's fund
   *
   * ```solidity
   * function createFeeManager() payable
   * ```
   *
   */
  createFeeManager!: () => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Creates a PolicyManager component for a particular fund manager's fund
   *
   * ```solidity
   * function createPolicyManagerFor(address) payable
   * ```
   * @param _manager The fund manager for whom the component should be created
   */
  createPolicyManagerFor!: (
    _manager: AddressLike,
  ) => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Creates a PolicyManager component for the sender's fund
   *
   * ```solidity
   * function createPolicyManager() payable
   * ```
   *
   */
  createPolicyManager!: () => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Creates a Shares component for a particular fund manager's fund
   *
   * ```solidity
   * function createSharesFor(address) payable
   * ```
   * @param _manager The fund manager for whom the component should be created
   */
  createSharesFor!: (
    _manager: AddressLike,
  ) => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Creates a Shares component for the sender's fund
   *
   * ```solidity
   * function createShares() payable
   * ```
   *
   */
  createShares!: () => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Creates a Vault component for a particular fund manager's fund
   *
   * ```solidity
   * function createVaultFor(address) payable
   * ```
   * @param _manager The fund manager for whom the component should be created
   */
  createVaultFor!: (
    _manager: AddressLike,
  ) => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Creates a Vault component for the sender's fund
   *
   * ```solidity
   * function createVault() payable
   * ```
   *
   */
  createVault!: () => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Complete setup for a particular fund manager's fund
   *
   * ```solidity
   * function completeFundSetupFor(address) payable
   * ```
   * @param _manager The fund manager for whom the fund setup should be completed
   */
  completeFundSetupFor!: (
    _manager: AddressLike,
  ) => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Complete setup for the sender's fund
   *
   * ```solidity
   * function completeFundSetup() payable
   * ```
   *
   */
  completeFundSetup!: () => TransactionWrapper<ethers.PayableOverrides>;
}
