// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/ICERC20.sol";
import "../../../../../interfaces/ICEther.sol";
import "../../../../../interfaces/ICompoundComptroller.sol";
import "../../../../../interfaces/IWETH.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title CompoundActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Compound lending functions
/// @dev Inheriting contract must have a receive() function
abstract contract CompoundActionsMixin is AssetHelpers {
    address private immutable COMPOUND_WETH_TOKEN;

    constructor(address _wethToken) public {
        COMPOUND_WETH_TOKEN = _wethToken;
    }

    /// @dev Helper to execute lending
    function __compoundLend(
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        address _incomingAsset
    ) internal {
        if (_outgoingAsset == COMPOUND_WETH_TOKEN) {
            IWETH(COMPOUND_WETH_TOKEN).withdraw(_outgoingAssetAmount);
            ICEther(_incomingAsset).mint{value: _outgoingAssetAmount}();
        } else {
            __approveAssetMaxAsNeeded(_outgoingAsset, _incomingAsset, _outgoingAssetAmount);
            ICERC20(_incomingAsset).mint(_outgoingAssetAmount);
        }
    }

    /// @dev Helper to execute redeeming
    function __compoundRedeem(
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        address _incomingAsset
    ) internal {
        ICERC20(_outgoingAsset).redeem(_outgoingAssetAmount);

        if (_incomingAsset == COMPOUND_WETH_TOKEN) {
            IWETH(payable(COMPOUND_WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `COMPOUND_WETH_TOKEN` variable
    /// @return compoundWethToken_ The `COMPOUND_WETH_TOKEN` variable value
    function getCompoundWethToken() public view returns (address compoundWethToken_) {
        return COMPOUND_WETH_TOKEN;
    }
}
