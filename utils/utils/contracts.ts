import { BigNumber, BigNumberish } from 'ethers';
import {
  contract,
  Call,
  Send,
  AddressLike,
  Contract,
} from '@crestproject/ethers';

export { MockChaiIntegratee } from '../codegen/MockChaiIntegratee';
export { MockChaiPriceSource } from '../codegen/MockChaiPriceSource';
export { MockGenericAdapter } from '../codegen/MockGenericAdapter';
export { MockGenericIntegratee } from '../codegen/MockGenericIntegratee';
export { MockKyberIntegratee } from '../codegen/MockKyberIntegratee';
export { MockKyberPriceSource } from '../codegen/MockKyberPriceSource';
export { MockChainlinkPriceSource } from '../codegen/MockChainlinkPriceSource';
export { MockToken } from '../codegen/MockToken';
export { WETH } from '../codegen/WETH';

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

export const StandardToken = contract.fromSignatures<StandardToken>`
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
