// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {IStaderWithdrawalsPosition} from "./IStaderWithdrawalsPosition.sol";

/// @title StaderWithdrawalsPositionParser
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Parser for Stader Withdrawal Positions
contract StaderWithdrawalsPositionParser is IExternalPositionParser {
    address private immutable ETHX_ADDRESS;
    address private immutable WETH_ADDRESS;

    constructor(address _ethxAddress, address _wethAddress) {
        ETHX_ADDRESS = _ethxAddress;
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
        if (_actionId == uint256(IStaderWithdrawalsPosition.Actions.RequestWithdrawal)) {
            IStaderWithdrawalsPosition.RequestWithdrawalActionArgs memory actionArgs =
                abi.decode(_encodedActionArgs, (IStaderWithdrawalsPosition.RequestWithdrawalActionArgs));

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = ETHX_ADDRESS;

            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = actionArgs.ethXAmount;
        } else if (_actionId == uint256(IStaderWithdrawalsPosition.Actions.ClaimWithdrawal)) {
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = WETH_ADDRESS;
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
