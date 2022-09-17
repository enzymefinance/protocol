// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestBalancerV2Vault Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestBalancerV2Vault {
    struct PoolBalanceChange {
        address[] assets;
        uint256[] limits;
        bytes userData;
        bool useInternalBalance;
    }

    function getPoolTokens(bytes32 _poolId)
        external
        view
        returns (
            address[] memory tokens_,
            uint256[] memory balances_,
            uint256 lastChangeBlock_
        );
}
