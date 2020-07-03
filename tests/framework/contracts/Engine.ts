import { ethers } from 'ethers';
import {
  Contract,
  TransactionWrapper,
  AddressLike,
  DeploymentTransactionWrapper,
} from './..';

/**
 * Liquidity contract and token sink
 * @title Engine Contract
 * @author Melon Council DAO <security@meloncoucil.io>
 */
export class Engine extends Contract {
  /**
   * The contract abis.
   */
  public static readonly abi: string[] = [
    'constructor(uint256 _delay, address _registry)',
    'event AmguPaid(uint256 amount)',
    'event Burn(uint256 amount)',
    'event RegistryChange(address registry)',
    'event SetAmguPrice(uint256 amguPrice)',
    'event Thaw(uint256 amount)',
    'function MLN_DECIMALS() view returns (uint256)',
    'function amguPrice() view returns (uint256)',
    'function frozenEther() view returns (uint256)',
    'function lastThaw() view returns (uint256)',
    'function liquidEther() view returns (uint256)',
    'function registry() view returns (address)',
    'function thawingDelay() view returns (uint256)',
    'function totalAmguConsumed() view returns (uint256)',
    'function totalEtherConsumed() view returns (uint256)',
    'function totalMlnBurned() view returns (uint256)',
    'function setRegistry(address _registry)',
    'function setAmguPrice(uint256 _price)',
    'function getAmguPrice() view returns (uint256)',
    'function premiumPercent() view returns (uint256)',
    'function payAmguInEther() payable',
    'function thaw()',
    'function enginePrice() view returns (uint256)',
    'function ethPayoutForMlnAmount(uint256 _mlnAmount) view returns (uint256)',
    'function sellAndBurnMln(uint256 _mlnAmount)',
    'function mlnToken() view returns (address)',
    'function priceSource() view returns (address)',
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
    _delay: ethers.BigNumberish,
    _registry: AddressLike,
  ) {
    return new DeploymentTransactionWrapper(this, bytecode, signer, [
      _delay,
      _registry,
    ]);
  }

  /**
   * ```solidity
   * function MLN_DECIMALS() view returns (uint256)
   * ```
   *
   */
  MLN_DECIMALS!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function amguPrice() view returns (uint256)
   * ```
   *
   */
  amguPrice!: ($$overrides?: ethers.CallOverrides) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function frozenEther() view returns (uint256)
   * ```
   *
   */
  frozenEther!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function lastThaw() view returns (uint256)
   * ```
   *
   */
  lastThaw!: ($$overrides?: ethers.CallOverrides) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function liquidEther() view returns (uint256)
   * ```
   *
   */
  liquidEther!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function registry() view returns (address)
   * ```
   *
   */
  registry!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * ```solidity
   * function thawingDelay() view returns (uint256)
   * ```
   *
   */
  thawingDelay!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function totalAmguConsumed() view returns (uint256)
   * ```
   *
   */
  totalAmguConsumed!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function totalEtherConsumed() view returns (uint256)
   * ```
   *
   */
  totalEtherConsumed!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function totalMlnBurned() view returns (uint256)
   * ```
   *
   */
  totalMlnBurned!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function getAmguPrice() view returns (uint256)
   * ```
   *
   */
  getAmguPrice!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function premiumPercent() view returns (uint256)
   * ```
   *
   */
  premiumPercent!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function enginePrice() view returns (uint256)
   * ```
   * @returns ETH per MLN including premium
   *
   */
  enginePrice!: (
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * ```solidity
   * function ethPayoutForMlnAmount(uint256) view returns (uint256)
   * ```
   *
   */
  ethPayoutForMlnAmount!: (
    _mlnAmount: ethers.BigNumberish,
    $$overrides?: ethers.CallOverrides,
  ) => Promise<ethers.BigNumber>;
  /**
   * Get MLN from the registry
   *
   * ```solidity
   * function mlnToken() view returns (address)
   * ```
   *
   */
  mlnToken!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * Get PriceSource from the registry
   *
   * ```solidity
   * function priceSource() view returns (address)
   * ```
   *
   */
  priceSource!: ($$overrides?: ethers.CallOverrides) => Promise<string>;
  /**
   * only callable by MTC
   *
   * ```solidity
   * function setRegistry(address)
   * ```
   *
   */
  setRegistry!: (
    _registry: AddressLike,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * set price of AMGU in MLN (base units)only callable by MGM
   *
   * ```solidity
   * function setAmguPrice(uint256)
   * ```
   *
   */
  setAmguPrice!: (
    _price: ethers.BigNumberish,
  ) => TransactionWrapper<ethers.Overrides>;
  /**
   * ```solidity
   * function payAmguInEther() payable
   * ```
   *
   */
  payAmguInEther!: () => TransactionWrapper<ethers.PayableOverrides>;
  /**
   * Delay only restarts when this function is called
   *
   * Move frozen ether to liquid pool after delay
   *
   * ```solidity
   * function thaw()
   * ```
   *
   */
  thaw!: () => TransactionWrapper<ethers.Overrides>;
  /**
   * Only Vault can call this function (via EngineAdapter)
   *
   * MLN must be approved first
   *
   * ```solidity
   * function sellAndBurnMln(uint256)
   * ```
   *
   */
  sellAndBurnMln!: (
    _mlnAmount: ethers.BigNumberish,
  ) => TransactionWrapper<ethers.Overrides>;
}
