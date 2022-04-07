// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveRegistryMetapoolFactory interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Limited interface for the Curve Registry contract at ICurveAddressProvider.get_address(3)
interface ICurveRegistryMetapoolFactory {
    function get_gauge(address) external view returns (address);

    function get_n_coins(address) external view returns (uint256);
}
