// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./ITestBalancerV2Vault.sol";

/// @title ITestBalancerV2Helpers Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestBalancerV2Helpers {
    function queryJoin(
        bytes32 _poolId,
        address _sender,
        address _recipient,
        ITestBalancerV2Vault.PoolBalanceChange memory _request
    ) external returns (uint256 bptOut_, uint256[] memory amountsIn_);

    function queryExit(
        bytes32 poolId,
        address sender,
        address recipient,
        ITestBalancerV2Vault.PoolBalanceChange memory request
    ) external returns (uint256 bptIn_, uint256[] memory amountsOut_);
}
