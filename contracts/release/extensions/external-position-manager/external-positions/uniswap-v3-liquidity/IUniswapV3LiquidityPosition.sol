// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IUniswapV3LiquidityPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IUniswapV3LiquidityPosition is IExternalPosition {
    enum UniswapV3LiquidityPositionActions {
        Mint,
        AddLiquidity,
        RemoveLiquidity,
        Collect,
        Purge
    }

    function getPairForNft(uint256) external view returns (address, address);
}
