// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {AddressArrayLib} from "../../../../../utils/0.6.12/AddressArrayLib.sol";
import {IExternalPositionParser} from "../IExternalPositionParser.sol";
import {IArbitraryLoanPosition} from "./IArbitraryLoanPosition.sol";
import {ArbitraryLoanPositionDataDecoder} from "./ArbitraryLoanPositionDataDecoder.sol";

pragma solidity 0.6.12;

/// @title ArbitraryLoanPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser contract for ArbitraryLoanPosition
contract ArbitraryLoanPositionParser is IExternalPositionParser, ArbitraryLoanPositionDataDecoder {
    using AddressArrayLib for address[];

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPosition The _externalPosition to be called
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
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
        if (_actionId == uint256(IArbitraryLoanPosition.Actions.ConfigureLoan)) {
            (, address asset, uint256 amount,,,) = __decodeConfigureLoanActionArgs(_encodedActionArgs);

            if (amount > 0) {
                assetsToTransfer_ = new address[](1);
                assetsToTransfer_[0] = asset;

                amountsToTransfer_ = new uint256[](1);
                amountsToTransfer_[0] = amount;
            }
        } else if (_actionId == uint256(IArbitraryLoanPosition.Actions.UpdateBorrowableAmount)) {
            int256 amountDelta = __decodeUpdateBorrowableAmountActionArgs(_encodedActionArgs);

            if (amountDelta < 0) {
                assetsToReceive_ = new address[](1);
                assetsToReceive_[0] = IArbitraryLoanPosition(_externalPosition).getLoanAsset();
            } else {
                assetsToTransfer_ = new address[](1);
                assetsToTransfer_[0] = IArbitraryLoanPosition(_externalPosition).getLoanAsset();

                amountsToTransfer_ = new uint256[](1);
                amountsToTransfer_[0] = uint256(amountDelta);
            }
        } else if (_actionId == uint256(IArbitraryLoanPosition.Actions.CloseLoan)) {
            // extraAssetsToSweep
            assetsToReceive_ = __decodeCloseLoanActionArgs(_encodedActionArgs);

            address loanAsset = IArbitraryLoanPosition(_externalPosition).getLoanAsset();
            if (ERC20(loanAsset).balanceOf(_externalPosition) > 0) {
                assetsToReceive_ = assetsToReceive_.addUniqueItem(loanAsset);
            }
        } else if (_actionId == uint256(IArbitraryLoanPosition.Actions.Reconcile)) {
            // extraAssetsToSweep
            assetsToReceive_ = __decodeReconcileActionArgs(_encodedActionArgs);

            address loanAsset = IArbitraryLoanPosition(_externalPosition).getLoanAsset();
            if (ERC20(loanAsset).balanceOf(_externalPosition) > 0) {
                assetsToReceive_ = assetsToReceive_.addUniqueItem(loanAsset);
            }
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Unused
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
