// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IAlphaHomoraV1Bank.sol";
import "../../../../../interfaces/IWETH.sol";

/// @title AlphaHomoraV1ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the AlphaHomoraV1 lending functions
/// @dev Inheriting contract must have a receive() function
abstract contract AlphaHomoraV1ActionsMixin {
    address private immutable ALPHA_HOMORA_V1_IBETH_TOKEN;
    address private immutable ALPHA_HOMORA_V1_WETH_TOKEN;

    constructor(address _ibethToken, address _wethToken) public {
        ALPHA_HOMORA_V1_IBETH_TOKEN = _ibethToken;
        ALPHA_HOMORA_V1_WETH_TOKEN = _wethToken;
    }

    /// @dev Helper to execute lending
    function __alphaHomoraV1Lend(uint256 _wethAmount) internal {
        IWETH(payable(ALPHA_HOMORA_V1_WETH_TOKEN)).withdraw(_wethAmount);

        IAlphaHomoraV1Bank(ALPHA_HOMORA_V1_IBETH_TOKEN).deposit{
            value: payable(address(this)).balance
        }();
    }

    /// @dev Helper to execute redeeming
    function __alphaHomoraV1Redeem(uint256 _ibethAmount) internal {
        IAlphaHomoraV1Bank(ALPHA_HOMORA_V1_IBETH_TOKEN).withdraw(_ibethAmount);

        IWETH(payable(ALPHA_HOMORA_V1_WETH_TOKEN)).deposit{
            value: payable(address(this)).balance
        }();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ALPHA_HOMORA_V1_IBETH_TOKEN` variable
    /// @return alphaHomoraV1IbethToken_ The `ALPHA_HOMORA_V1_IBETH_TOKEN` variable value
    function getAlphaHomoraV1IbethToken() public view returns (address alphaHomoraV1IbethToken_) {
        return ALPHA_HOMORA_V1_IBETH_TOKEN;
    }

    /// @notice Gets the `ALPHA_HOMORA_V1_WETH_TOKEN` variable
    /// @return alphaHomoraV1IWethToken_ The `ALPHA_HOMORA_V1_WETH_TOKEN` variable value
    function getAlphaHomoraV1WethToken() public view returns (address alphaHomoraV1IWethToken_) {
        return ALPHA_HOMORA_V1_WETH_TOKEN;
    }
}
