// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../tokens/MockToken.sol";

contract MockUniswapV2Pair is MockToken("Uniswap V2", "UNI-V2", 18) {
    // TODO: NOT YET REVIEWED

    address public token0;
    address public token1;

    constructor(address _token0, address _token1) public {
        token0 = _token0;
        token1 = _token1;
    }
}
