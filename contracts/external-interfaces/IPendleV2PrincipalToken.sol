// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2PrincipalToken Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2PrincipalToken {
    function SY() external view returns (address syTokenAddress_);

    function isExpired() external view returns (bool isExpired_);
}
