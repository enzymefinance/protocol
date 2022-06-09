// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IGoldfinchSeniorPool Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IGoldfinchSeniorPool {
    function config() external view returns (address config_);

    function sharePrice() external view returns (uint256 price_);
}
