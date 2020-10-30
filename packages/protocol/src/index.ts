import { BigNumber, BigNumberish } from 'ethers';
import {
  contract,
  Call,
  Send,
  AddressLike,
  Contract,
} from '@crestproject/crestproject';

// Persistent core
export { Dispatcher } from './codegen/Dispatcher';
export { VaultProxy } from './codegen/VaultProxy';

// Persistent release interfaces
export { IMigrationHookHandler } from './codegen/IMigrationHookHandler';
export { IProxiableVault } from './codegen/IProxiableVault';

// Release core
export { FundDeployer } from './codegen/FundDeployer';
export { ComptrollerLib } from './codegen/ComptrollerLib';
export { ComptrollerProxy } from './codegen/ComptrollerProxy';
export { PermissionedVaultActionLib } from './codegen/PermissionedVaultActionLib';
export { VaultLib } from './codegen/VaultLib';
export { FundLifecycleLib } from './codegen/FundLifecycleLib';

// Infrastructure
export { Engine } from './codegen/Engine';
export { ValueInterpreter } from './codegen/ValueInterpreter';

// Extensions
export { IExtension } from './codegen/IExtension';
export { FeeManager } from './codegen/FeeManager';
export { IntegrationManager } from './codegen/IntegrationManager';
export { PolicyManager } from './codegen/PolicyManager';

// Primitive price feeds
export { ChainlinkPriceFeed } from './codegen/ChainlinkPriceFeed';

// Derivative price feeds
export { AggregatedDerivativePriceFeed } from './codegen/AggregatedDerivativePriceFeed';
export { ChaiPriceFeed } from './codegen/ChaiPriceFeed';
export { CompoundPriceFeed } from './codegen/CompoundPriceFeed';

// Integratee interfaces
export { IUniswapV2Factory } from './codegen/IUniswapV2Factory';
export { IUniswapV2Pair } from './codegen/IUniswapV2Pair';
export { IKyberNetworkProxy } from './codegen/IKyberNetworkProxy';
export { ICERC20 } from './codegen/ICERC20';

// Integration adapters
export { ChaiAdapter } from './codegen/ChaiAdapter';
export { EngineAdapter } from './codegen/EngineAdapter';
export { KyberAdapter } from './codegen/KyberAdapter';
export { TrackedAssetsAdapter } from './codegen/TrackedAssetsAdapter';
export { ZeroExV2Adapter } from './codegen/ZeroExV2Adapter';
export { CompoundAdapter } from './codegen/CompoundAdapter';

// Fees
export { IFee } from './codegen/IFee';
export { EntranceRateBurnFee } from './codegen/EntranceRateBurnFee';
export { EntranceRateDirectFee } from './codegen/EntranceRateDirectFee';
export { ManagementFee } from './codegen/ManagementFee';
export { PerformanceFee } from './codegen/PerformanceFee';

// Policies
export { IPolicy } from './codegen/IPolicy';
export { AdapterBlacklist } from './codegen/AdapterBlacklist';
export { AdapterWhitelist } from './codegen/AdapterWhitelist';
export { AssetBlacklist } from './codegen/AssetBlacklist';
export { AssetWhitelist } from './codegen/AssetWhitelist';
export { BuySharesPriceFeedTolerance } from './codegen/BuySharesPriceFeedTolerance';
export { MaxConcentration } from './codegen/MaxConcentration';
export { InvestorWhitelist } from './codegen/InvestorWhitelist';

// Peripheral
export { FundCalculator } from './codegen/FundCalculator';

// Mocks
export { MockVaultLib } from './codegen/MockVaultLib';
export { MockChaiIntegratee } from './codegen/MockChaiIntegratee';
export { MockChaiPriceSource } from './codegen/MockChaiPriceSource';
export { MockGenericAdapter } from './codegen/MockGenericAdapter';
export { MockGenericIntegratee } from './codegen/MockGenericIntegratee';
export { MockKyberIntegratee } from './codegen/MockKyberIntegratee';
export { MockKyberPriceSource } from './codegen/MockKyberPriceSource';
export { MockChainlinkPriceSource } from './codegen/MockChainlinkPriceSource';
export { MockToken } from './codegen/MockToken';
export { MockZeroExV2Integratee } from './codegen/MockZeroExV2Integratee';
export { WETH } from './codegen/WETH';

// prettier-ignore
export interface StandardToken extends Contract<StandardToken> {
  // Shortcuts (using function name of first overload)
  allowance: Call<(owner: AddressLike, spender: AddressLike) => BigNumber, Contract<any>>
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
  balanceOf: Call<(account: AddressLike) => BigNumber, Contract<any>>
  decimals: Call<() => BigNumber, Contract<any>>
  totalSupply: Call<() => BigNumber, Contract<any>>
  transfer: Send<(recipient: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
  transferFrom: Send<(sender: AddressLike, recipient: AddressLike, amount: BigNumberish) => boolean, Contract<any>>

  // Explicit accessors (using full function signature)
  'allowance(address,address)': Call<(owner: AddressLike, spender: AddressLike) => BigNumber, Contract<any>>
  'approve(address,uint256)': Send<(spender: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
  'balanceOf(address)': Call<(account: AddressLike) => BigNumber, Contract<any>>
  'decimals()': Call<() => BigNumber, Contract<any>>
  'totalSupply()': Call<() => BigNumber, Contract<any>>
  'transfer(address,uint256)': Send<(recipient: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
  'transferFrom(address,address,uint256)': Send<(sender: AddressLike, recipient: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
}

export const StandardToken = contract<StandardToken>()`
  event Approval(address indexed owner, address indexed spender, uint256 value)
  event Transfer(address indexed from, address indexed to, uint256 value)
  function allowance(address owner, address spender) view returns (uint256)
  function approve(address spender, uint256 amount) returns (bool)
  function balanceOf(address account) view returns (uint256)
  function decimals() view returns (uint8)
  function totalSupply() view returns (uint256)
  function transfer(address recipient, uint256 amount) returns (bool)
  function transferFrom(address sender, address recipient, uint256 amount) returns (bool)
`;
