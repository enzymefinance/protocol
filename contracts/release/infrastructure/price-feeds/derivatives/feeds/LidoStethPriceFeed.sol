// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./utils/SinglePeggedDerivativePriceFeedBase.sol";

/// @title LidoStethPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Lido stETH, which maps 1:1 with ETH (https://lido.fi/)
contract LidoStethPriceFeed is SinglePeggedDerivativePriceFeedBase {
    constructor(address _steth, address _weth)
        public
        SinglePeggedDerivativePriceFeedBase(_steth, _weth)
    {}
}
