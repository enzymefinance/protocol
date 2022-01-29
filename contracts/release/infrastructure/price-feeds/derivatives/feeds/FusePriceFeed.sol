// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./CompoundPriceFeed.sol";

/// @title FusePriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Fuse Tokens (fTokens)
/// @dev Since Fuse is a fork of Compound, this contract simply inherits the CompoundPriceFeed contract.
/// Note that deployments retain the original namespaces such as "compound", "cTokens", and "cETH",
/// rather than their counterparts such as "fuse", "fTokens", and fETH".
contract FusePriceFeed is CompoundPriceFeed {
    using SafeMath for uint256;

    constructor(address _fundDeployer, address _weth)
        public
        CompoundPriceFeed(_fundDeployer, _weth)
    {}
}
