// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/infrastructure/price-feeds/derivatives/feeds/utils/SinglePeggedDerivativePriceFeedBase.sol";

/// @title TestSingleUnderlyingDerivativeRegistry Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test implementation of SinglePeggedDerivativePriceFeedBase
contract TestSinglePeggedDerivativePriceFeed is SinglePeggedDerivativePriceFeedBase {
    constructor(address _derivative, address _underlying)
        public
        SinglePeggedDerivativePriceFeedBase(_derivative, _underlying)
    {}
}
