// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IArrakisV2Resolver Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IArrakisV2Resolver {
    function getMintAmounts(address _vaultV2, uint256 _amount0Max, uint256 _amount1Max)
        external
        view
        returns (uint256 amount0_, uint256 amount1_, uint256 mintAmount_);
}
