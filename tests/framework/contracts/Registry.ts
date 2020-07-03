import { ethers } from 'ethers';
import {
  Contract,
  TransactionWrapper,
  AddressLike,
  DeploymentTransactionWrapper,
} from './..';

/**
 * The top-level contract for all Melon infrastructure that maintains registries of assets, integrations, fees, policies, and funds, as well as the current versions of infrastructural contracts
 * @title Registry Contract
 * @author Melon Council DAO <security@meloncoucil.io>
 */
export class Registry extends Contract {
  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [
    'constructor(address _MTC, address _MGM)',
    'event DerivativePriceSourceUpdated(address derivative, address priceSource)',
    'event EngineChanged(address engine)',
    'event FeeAdded(address fee)',
    'event FeeRemoved(address fee)',
    'event FundAdded(address indexed manager, address hub, bytes32 hashedName)',
    'event FundFactoryChanged(address fundFactory)',
    'event IncentiveChanged(uint256 incentiveAmount)',
    'event IntegrationAdapterAdded(address indexed adapter, string indexed identifier)',
    'event IntegrationAdapterRemoved(address indexed adapter, string indexed identifier)',
    'event MGMChanged(address MGM)',
    'event MlnTokenChanged(address mlnToken)',
    'event NativeAssetChanged(address nativeAsset)',
    'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
    'event PolicyAdded(address indexed policy, string indexed identifier)',
    'event PolicyRemoved(address indexed policy, string indexed identifier)',
    'event PriceSourceChanged(address priceSource)',
    'event PrimitiveAdded(address primitive)',
    'event PrimitiveRemoved(address primitive)',
    'event SharesRequestorChanged(address sharesRequestor)',
    'event ValueInterpreterChanged(address valueInterpreter)',
    'function MGM() view returns (address)',
    'function MTC() view returns (address)',
    'function derivativeToPriceSource(address) view returns (address)',
    'function engine() view returns (address)',
    'function fundFactory() view returns (address)',
    'function fundFactoryIsRegistered(address) view returns (bool)',
    'function fundIsRegistered(address) view returns (bool)',
    'function fundNameHashIsTaken(bytes32) view returns (bool)',
    'function incentive() view returns (uint256)',
    'function managerToFunds(address, uint256) view returns (address)',
    'function mlnToken() view returns (address)',
    'function nativeAsset() view returns (address)',
    'function owner() view returns (address)',
    'function priceSource() view returns (address)',
    'function renounceOwnership()',
    'function sharesRequestor() view returns (address)',
    'function transferOwnership(address _newOwner)',
    'function valueInterpreter() view returns (address)',
    'function deregisterPrimitive(address _primitive)',
    'function getRegisteredPrimitives() view returns (address[])',
    'function registerPrimitive(address _primitive)',
    'function registerDerivativePriceSource(address _derivative, address _priceSource)',
    'function primitiveIsRegistered(address _primitive) view returns (bool)',
    'function deregisterFee(address _fee)',
    'function getRegisteredFees() view returns (address[])',
    'function registerFee(address _fee)',
    'function feeIsRegistered(address _fee) view returns (bool)',
    'function registerFund(address _hub, address _manager, bytes32 _hashedName)',
    'function deregisterPolicy(address _policy)',
    'function getRegisteredPolicies() view returns (address[])',
    'function registerPolicy(address _policy)',
    'function policyIsRegistered(address _policy) view returns (bool)',
    'function deregisterIntegrationAdapter(address _adapter)',
    'function getRegisteredIntegrationAdapters() view returns (address[])',
    'function registerIntegrationAdapter(address _adapter)',
    'function integrationAdapterIsRegistered(address _adapter) view returns (bool)',
    'function setFundFactory(address _fundFactory)',
    'function setIncentive(uint256 _amount)',
    'function setPriceSource(address _priceSource)',
    'function setMlnToken(address _mlnToken)',
    'function setNativeAsset(address _nativeAsset)',
    'function setEngine(address _engine)',
    'function setSharesRequestor(address _sharesRequestor)',
    'function setValueInterpreter(address _valueInterpreter)',
  ];

  /**
   * Deploy a new contract instance.
   *
   * @param signer The ethers.js signer instance to use.
   */
  public static deploy(
    signer: ethers.Signer,
    _MTC: AddressLike,
    _MGM: AddressLike,
  ) {
    return new DeploymentTransactionWrapper(this, signer, [_MTC, _MGM]);
  }

  /**
   * ```solidity
   * function MGM() view returns (address)
   * ```
   *
   */
  MGM!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function MTC() view returns (address)
   * ```
   *
   */
  MTC!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function derivativeToPriceSource(address) view returns (address)
   * ```
   *
   */
  derivativeToPriceSource!: (
    $$0: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string>;
  /**
   * ```solidity
   * function engine() view returns (address)
   * ```
   *
   */
  engine!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function fundFactory() view returns (address)
   * ```
   *
   */
  fundFactory!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function fundFactoryIsRegistered(address) view returns (bool)
   * ```
   *
   */
  fundFactoryIsRegistered!: (
    $$0: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * ```solidity
   * function fundIsRegistered(address) view returns (bool)
   * ```
   *
   */
  fundIsRegistered!: (
    $$0: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * ```solidity
   * function fundNameHashIsTaken(bytes32) view returns (bool)
   * ```
   *
   */
  fundNameHashIsTaken!: (
    $$0: string | ethers.utils.BytesLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * ```solidity
   * function incentive() view returns (uint256)
   * ```
   *
   */
  incentive!: ($$overrides?: ethers.CallOverrides) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function managerToFunds(address,uint256) view returns (address)
   * ```
   *
   */
  managerToFunds!: (
    $$0: AddressLike,
    $$1: ethers.BigNumberish,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string>;
  /**
   * ```solidity
   * function mlnToken() view returns (address)
   * ```
   *
   */
  mlnToken!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function nativeAsset() view returns (address)
   * ```
   *
   */
  nativeAsset!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * Returns the address of the current owner.
   *
   * ```solidity
   * function owner() view returns (address)
   * ```
   *
   */
  owner!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function priceSource() view returns (address)
   * ```
   *
   */
  priceSource!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function sharesRequestor() view returns (address)
   * ```
   *
   */
  sharesRequestor!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function valueInterpreter() view returns (address)
   * ```
   *
   */
  valueInterpreter!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * Get all registered primitives
   *
   * ```solidity
   * function getRegisteredPrimitives() view returns (address[])
   * ```
   * @returns A list of all registered primitive addresses
   *
   */
  getRegisteredPrimitives!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string[]>;
  /**
   * Check whether a primitive is registered
   *
   * ```solidity
   * function primitiveIsRegistered(address) view returns (bool)
   * ```
   * @param _primitive The address of the primitive to check
   * @returns True if the primitive is registered
   *
   */
  primitiveIsRegistered!: (
    _primitive: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * Get all registered fees
   *
   * ```solidity
   * function getRegisteredFees() view returns (address[])
   * ```
   * @returns A list of all registered fee addresses
   *
   */
  getRegisteredFees!: ($$overrides?: ethers.CallOverrides) => Promise<string[]>;
  /**
   * Check whether a fee is registered
   *
   * ```solidity
   * function feeIsRegistered(address) view returns (bool)
   * ```
   * @param _fee The address of the fee to check
   * @returns True if the fee is registered
   *
   */
  feeIsRegistered!: (
    _fee: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * Get all registered policies
   *
   * ```solidity
   * function getRegisteredPolicies() view returns (address[])
   * ```
   * @returns A list of all registered policy addresses
   *
   */
  getRegisteredPolicies!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string[]>;
  /**
   * Check whether a policy is registered
   *
   * ```solidity
   * function policyIsRegistered(address) view returns (bool)
   * ```
   * @param _policy The address of the policy to check
   * @returns True if the policy is registered
   *
   */
  policyIsRegistered!: (
    _policy: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * Get all registered integration adapters
   *
   * ```solidity
   * function getRegisteredIntegrationAdapters() view returns (address[])
   * ```
   * @returns A list of all registered integration adapters
   *
   */
  getRegisteredIntegrationAdapters!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<string[]>;
  /**
   * Check if an integration adapter is on the Registry
   *
   * ```solidity
   * function integrationAdapterIsRegistered(address) view returns (bool)
   * ```
   * @param _adapter The adapter to check
   * @returns True if the adapter is registered
   *
   */
  integrationAdapterIsRegistered!: (
    _adapter: AddressLike,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<boolean>;
  /**
   * Ownership cannot be destroyed
   *
   * Renounces ownership of the contract (NOT ALLOWED)
   *
   * ```solidity
   * function renounceOwnership()
   * ```
   *
   */
  renounceOwnership!: () => TransactionWrapper<ethers.Overrides>;
  /**
   * Ownership is only transferrable until the MTC receives ownership. After that, ownership is no longer transferrable. This is desirable so that Melon developers can do the time-consuming work of deploying and configuring a contract, before giving custody of it to the Melon Council
   *
   * Transfers ownership of the contract
   *
   * ```solidity
   * function transferOwnership(address)
   * ```
   * @param _newOwner The new contract owner
   */
  transferOwnership!: (
    _newOwner: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Remove a primitive from the list of registered primitives
   *
   * ```solidity
   * function deregisterPrimitive(address)
   * ```
   * @param _primitive The address of the primitive to remove
   */
  deregisterPrimitive!: (
    _primitive: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Add a primitive to the Registry
   *
   * ```solidity
   * function registerPrimitive(address)
   * ```
   * @param _primitive Address of primitive to be registered
   */
  registerPrimitive!: (
    _primitive: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Add or update a price source for a derivative
   *
   * ```solidity
   * function registerDerivativePriceSource(address,address)
   * ```
   * @param _derivative The address of the derivative
   * @param _priceSource The address of the price source
   */
  registerDerivativePriceSource!: (
    _derivative: AddressLike,
    _priceSource: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Remove a fee from the list of registered fees
   *
   * ```solidity
   * function deregisterFee(address)
   * ```
   * @param _fee The address of the fee to remove
   */
  deregisterFee!: (_fee: AddressLike) => TransactionWrapper<ethers.Overrides>;
  /**
   * Add a fee to the Registry
   *
   * ```solidity
   * function registerFee(address)
   * ```
   * @param _fee Address of fee to be registered
   */
  registerFee!: (_fee: AddressLike) => TransactionWrapper<ethers.Overrides>;
  /**
   * Add a fund to the Registry
   *
   * ```solidity
   * function registerFund(address,address,bytes32)
   * ```
   * @param _hub The Hub for the fund
   * @param _manager The manager of the fund
   */
  registerFund!: (
    _hub: AddressLike,
    _manager: AddressLike,
    _hashedName: string | ethers.utils.BytesLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Remove a policy from the list of registered policies
   *
   * ```solidity
   * function deregisterPolicy(address)
   * ```
   * @param _policy The address of the policy to remove
   */
  deregisterPolicy!: (
    _policy: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Add a policy to the Registry
   *
   * ```solidity
   * function registerPolicy(address)
   * ```
   * @param _policy Address of policy to be registered
   */
  registerPolicy!: (
    _policy: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Remove an integration adapter from the Registry
   *
   * ```solidity
   * function deregisterIntegrationAdapter(address)
   * ```
   * @param _adapter The address of the adapter to remove
   */
  deregisterIntegrationAdapter!: (
    _adapter: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * ```solidity
   * function registerIntegrationAdapter(address)
   * ```
   * @param _adapter Address of integration adapter contract
   */
  registerIntegrationAdapter!: (
    _adapter: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the fundFactory storage var
   *
   * ```solidity
   * function setFundFactory(address)
   * ```
   * @param _fundFactory The FundFactory contract to set
   */
  setFundFactory!: (
    _fundFactory: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the incentive storage var
   *
   * ```solidity
   * function setIncentive(uint256)
   * ```
   * @param _amount The amount to set for incentive (in wei)
   */
  setIncentive!: (
    _amount: ethers.BigNumberish,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the priceSource storage var
   *
   * ```solidity
   * function setPriceSource(address)
   * ```
   * @param _priceSource The PriceSource contract to set
   */
  setPriceSource!: (
    _priceSource: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the mlnToken storage var
   *
   * ```solidity
   * function setMlnToken(address)
   * ```
   * @param _mlnToken The MlnToken contract to set
   */
  setMlnToken!: (
    _mlnToken: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the nativeAsset storage var
   *
   * ```solidity
   * function setNativeAsset(address)
   * ```
   * @param _nativeAsset The native asset contract to set
   */
  setNativeAsset!: (
    _nativeAsset: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the engine storage var
   *
   * ```solidity
   * function setEngine(address)
   * ```
   * @param _engine The Engine contract to set
   */
  setEngine!: (_engine: AddressLike) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the sharesRequestor storage var
   *
   * ```solidity
   * function setSharesRequestor(address)
   * ```
   * @param _sharesRequestor The SharesRequestor contract to set
   */
  setSharesRequestor!: (
    _sharesRequestor: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * Set the valueInterpreter storage var
   *
   * ```solidity
   * function setValueInterpreter(address)
   * ```
   * @param _valueInterpreter The ValueInterpreter contract to set
   */
  setValueInterpreter!: (
    _valueInterpreter: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
}
