// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IBalancerV2Vault.sol";

/// @title BalancerV2ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with BalancerV2
abstract contract BalancerV2ActionsMixin {
    IBalancerV2Vault internal immutable BALANCER_VAULT_CONTRACT;

    constructor(address _balancerVault) public {
        BALANCER_VAULT_CONTRACT = IBalancerV2Vault(_balancerVault);
    }

    /// @dev Helper to add liquidity
    function __balancerV2Lend(
        bytes32 _poolId,
        address _sender,
        address _recipient,
        IBalancerV2Vault.PoolBalanceChange memory _request
    ) internal {
        BALANCER_VAULT_CONTRACT.joinPool(_poolId, _sender, _recipient, _request);
    }

    /// @dev Helper to remove liquidity
    function __balancerV2Redeem(
        bytes32 _poolId,
        address _sender,
        address payable _recipient,
        IBalancerV2Vault.PoolBalanceChange memory _request
    ) internal {
        BALANCER_VAULT_CONTRACT.exitPool(_poolId, _sender, _recipient, _request);
    }
}
