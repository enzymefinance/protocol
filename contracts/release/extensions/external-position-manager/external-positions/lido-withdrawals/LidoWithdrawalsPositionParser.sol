// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPositionParser} from "../IExternalPositionParser.sol";
import {ILidoWithdrawalsPosition} from "./ILidoWithdrawalsPosition.sol";
import {LidoWithdrawalsPositionDataDecoder} from "./LidoWithdrawalsPositionDataDecoder.sol";

pragma solidity 0.8.19;

/// @title LidoWithdrawalsPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Lido Withdrawal Positions
contract LidoWithdrawalsPositionParser is IExternalPositionParser, LidoWithdrawalsPositionDataDecoder {
    address private immutable STETH_ADDRESS;
    address private immutable WETH_ADDRESS;

    constructor(address _stethAddress, address _wethAddress) {
        STETH_ADDRESS = _stethAddress;
        WETH_ADDRESS = _wethAddress;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(address, uint256 _actionId, bytes memory _encodedActionArgs)
        external
        view
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(ILidoWithdrawalsPosition.Actions.RequestWithdrawals)) {
            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = STETH_ADDRESS;
            amountsToTransfer_ = new uint256[](1);

            // Sum the total amount of stETH to be withdrawn
            uint256[] memory amounts = __decodeRequestWithdrawalsActionArgs(_encodedActionArgs);
            for (uint256 i; i < amounts.length; i++) {
                amountsToTransfer_[0] += amounts[i];
            }
        } else if (_actionId == uint256(ILidoWithdrawalsPosition.Actions.ClaimWithdrawals)) {
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = WETH_ADDRESS;
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
