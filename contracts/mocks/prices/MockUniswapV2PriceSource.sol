// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../release/interfaces/IUniswapV2Pair.sol";
import "../tokens/MockToken.sol";

/// @dev This price source mocks the integration with Uniswap Pair
/// Docs of Uniswap Pair implementation: <https://uniswap.org/docs/v2/smart-contracts/pair/>
contract MockUniswapV2PriceSource is MockToken("Uniswap V2", "UNI-V2", 18) {
    address private immutable TOKEN_0;
    address private immutable TOKEN_1;

    constructor(address _token0, address _token1) public {
        TOKEN_0 = _token0;
        TOKEN_1 = _token1;
    }

    /// @dev returns reserves for each token on the Uniswap Pair
    /// Reserves will be used to calculate the pair price
    /// Inherited from IUniswapV2Pair
    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        )
    {
        reserve0 = uint112(ERC20(token0()).balanceOf(address(this)));
        reserve1 = uint112(ERC20(token1()).balanceOf(address(this)));
        return (reserve0, reserve1, uint32(block.timestamp));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @dev Inherited from IUniswapV2Pair
    function token0() public view returns (address) {
        return TOKEN_0;
    }

    /// @dev Inherited from IUniswapV2Pair
    function token1() public view returns (address) {
        return TOKEN_1;
    }

    /// @dev Inherited from IUniswapV2Pair
    function kLast() public pure returns (uint256) {
        return 0;
    }
}
