// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IValueInterpreter} from "../../../release/infrastructure/value-interpreter/IValueInterpreter.sol";

/// @title UniswapV3PositionHelper Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library to help computing the value of Uniswap v3 positions
library UniswapV3PositionHelper {
    uint256 private constant TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE = 1 ether;
    uint256 private constant UNISWAP_SQRT_INFLATE_FACTOR = 2 ** 192;

    // INTERNAL FUNCTIONS
    function calcAssetPairSqrtRatioX96(address _valueInterpreterAddress, address _token0Address, address _token1Address)
        internal
        returns (uint160 sqrtRatioX96_)
    {
        // Adapted from UniswapV3 white paper formula 6.4 <https://uniswap.org/whitepaper-v3.pdf>
        return uint160(
            Math.sqrt(
                UNISWAP_SQRT_INFLATE_FACTOR * TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE
                    / IValueInterpreter(_valueInterpreterAddress).calcCanonicalAssetValue(
                        _token1Address, TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE, _token0Address
                    )
            )
        );
    }
}
