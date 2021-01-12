// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../release/interfaces/IUniswapV2Pair.sol";
import "../prices/CentralizedRateProvider.sol";
import "../tokens/MockToken.sol";

/// @dev This price source mocks the integration with Uniswap Pair
/// Docs of Uniswap Pair implementation: <https://uniswap.org/docs/v2/smart-contracts/pair/>
contract MockUniswapV2PriceSource is MockToken("Uniswap V2", "UNI-V2", 18) {
    using SafeMath for uint256;

    address private immutable TOKEN_0;
    address private immutable TOKEN_1;
    address private immutable CENTRALIZED_RATE_PROVIDER;

    constructor(
        address _centralizedRateProvider,
        address _token0,
        address _token1
    ) public {
        CENTRALIZED_RATE_PROVIDER = _centralizedRateProvider;
        TOKEN_0 = _token0;
        TOKEN_1 = _token1;
    }

    /// @dev returns reserves for each token on the Uniswap Pair
    /// Reserves will be used to calculate the pair price
    /// Inherited from IUniswapV2Pair
    function getReserves()
        external
        returns (
            uint112 reserve0_,
            uint112 reserve1_,
            uint32 blockTimestampLast_
        )
    {
        uint256 baseAmount = ERC20(TOKEN_0).balanceOf(address(this));
        reserve0_ = uint112(baseAmount);
        reserve1_ = uint112(
            CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER).calcLiveAssetValue(
                TOKEN_0,
                baseAmount,
                TOKEN_1
            )
        );

        return (reserve0_, reserve1_, blockTimestampLast_);
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
