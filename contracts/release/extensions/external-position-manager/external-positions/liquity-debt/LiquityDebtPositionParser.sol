// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {ILiquityTroveManager} from "../../../../../external-interfaces/ILiquityTroveManager.sol";
import {IExternalPositionParser} from "../IExternalPositionParser.sol";
import {ILiquityDebtPosition} from "./ILiquityDebtPosition.sol";
import {LiquityDebtPositionDataDecoder} from "./LiquityDebtPositionDataDecoder.sol";

pragma solidity 0.6.12;

/// @title LiquityDebtPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Liquity Debt Positions
contract LiquityDebtPositionParser is IExternalPositionParser, LiquityDebtPositionDataDecoder {
    address private immutable LIQUITY_TROVE_MANAGER;
    address private immutable LUSD_TOKEN;
    address private immutable WETH_TOKEN;

    constructor(address _liquityTroveManager, address _lusdToken, address _wethToken) public {
        LIQUITY_TROVE_MANAGER = _liquityTroveManager;
        LUSD_TOKEN = _lusdToken;
        WETH_TOKEN = _wethToken;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPosition The _externalPosition to be called
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transfered from the Vault
    /// @return amountsToTransfer_ The amounts to be transfered from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(address _externalPosition, uint256 _actionId, bytes memory _encodedActionArgs)
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(ILiquityDebtPosition.Actions.OpenTrove)) {
            (, uint256 collateralAmount,,,) = __decodeOpenTroveArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);
            assetsToTransfer_[0] = WETH_TOKEN;
            amountsToTransfer_[0] = collateralAmount;
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = LUSD_TOKEN;
        }
        if (_actionId == uint256(ILiquityDebtPosition.Actions.AddCollateral)) {
            (uint256 collateralAmount,,) = __decodeAddCollateralActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);
            assetsToTransfer_[0] = WETH_TOKEN;
            amountsToTransfer_[0] = collateralAmount;
        }
        if (_actionId == uint256(ILiquityDebtPosition.Actions.RemoveCollateral)) {
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = WETH_TOKEN;
        } else if (_actionId == uint256(ILiquityDebtPosition.Actions.RepayBorrow)) {
            (uint256 lusdAmount,,) = __decodeRepayBorrowActionArgs(_encodedActionArgs);
            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);
            assetsToTransfer_[0] = LUSD_TOKEN;
            amountsToTransfer_[0] = lusdAmount;
        } else if (_actionId == uint256(ILiquityDebtPosition.Actions.Borrow)) {
            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = LUSD_TOKEN;
        } else if (_actionId == uint256(ILiquityDebtPosition.Actions.CloseTrove)) {
            uint256 lusdAmount = ILiquityTroveManager(LIQUITY_TROVE_MANAGER).getTroveDebt(_externalPosition);

            assetsToTransfer_ = new address[](1);
            assetsToReceive_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = LUSD_TOKEN;
            amountsToTransfer_[0] = lusdAmount;
            assetsToReceive_[0] = WETH_TOKEN;
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @return initArgs_ Parsed and encoded args for ExternalPositionProxy.init()
    function parseInitArgs(address, bytes memory) external override returns (bytes memory initArgs_) {
        return "";
    }
}
