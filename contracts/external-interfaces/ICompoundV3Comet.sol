// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ICompoundV3Comet Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ICompoundV3Comet {
    function baseToken() external view returns (address baseToken_);

    function supplyTo(
        address _dst,
        address _asset,
        uint256 _amount
    ) external;

    function withdrawTo(
        address _dst,
        address _asset,
        uint256 _amount
    ) external;
}
