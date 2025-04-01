// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IMysoV3DataTypes} from "../../../../../external-interfaces/IMysoV3DataTypes.sol";
import {IMysoV3Escrow} from "../../../../../external-interfaces/IMysoV3Escrow.sol";
import {IMysoV3Router} from "../../../../../external-interfaces/IMysoV3Router.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {IMysoV3OptionWritingPosition} from "./IMysoV3OptionWritingPosition.sol";

/// @title MysoV3OptionWritingPositionParser
/// @dev Parses Myso Position contract interactions
contract MysoV3OptionWritingPositionParser is IExternalPositionParser {
    IMysoV3Router public immutable MYSO_ROUTER;

    using AddressArrayLib for address[];

    constructor(address _mysoRouterAddress) {
        MYSO_ROUTER = IMysoV3Router(_mysoRouterAddress);
    }

    /// @notice Parses assets for MysoV3OptionWritingPosition actions
    /// @param _actionId The action identifier
    /// @param _encodedActionArgs The encoded parameters for the action
    /// @return assetsToTransfer_ The assets to be sent from the vault
    /// @return amountsToTransfer_ The amounts to be sent from the vault
    /// @return assetsToReceive_ The assets to be received to the vault
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
        if (_actionId == uint256(IMysoV3OptionWritingPosition.Actions.CreateEscrowByTakingQuote)) {
            (assetsToTransfer_, amountsToTransfer_, assetsToReceive_) = __decodeCreateEscrowByTakingQuote({
                _actionArgs: abi.decode(
                    _encodedActionArgs, (IMysoV3OptionWritingPosition.CreateEscrowByTakingQuoteActionArgs)
                )
            });
        } else if (_actionId == uint256(IMysoV3OptionWritingPosition.Actions.CreateEscrowByStartingAuction)) {
            (assetsToTransfer_, amountsToTransfer_) = __decodeCreateEscrowByStartingAuction({
                _actionArgs: abi.decode(
                    _encodedActionArgs, (IMysoV3OptionWritingPosition.CreateEscrowByStartingAuctionActionArgs)
                )
            });
        } else if (_actionId == uint256(IMysoV3OptionWritingPosition.Actions.CloseAndSweepEscrows)) {
            assetsToReceive_ = __decodeCloseAndSweepEscrows({
                _actionArgs: abi.decode(_encodedActionArgs, (IMysoV3OptionWritingPosition.CloseAndSweepEscrowActionArgs))
            });
        } else if (_actionId == uint256(IMysoV3OptionWritingPosition.Actions.WithdrawTokensFromEscrows)) {
            assetsToReceive_ = __decodeWithdrawTokensFromEscrows({
                _actionArgs: abi.decode(
                    _encodedActionArgs, (IMysoV3OptionWritingPosition.WithdrawTokensFromEscrowsActionArgs)
                )
            });
        } else if (_actionId == uint256(IMysoV3OptionWritingPosition.Actions.Sweep)) {
            assetsToReceive_ = __decodeSweep({
                _actionArgs: abi.decode(_encodedActionArgs, (IMysoV3OptionWritingPosition.SweepActionArgs))
            });
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a
    /// newly-deployed ExternalPositionProxy
    /// @dev Nothing to initialize for this MYSO v3 external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}

    /// @notice Parses the assets to be received for a Sweep action
    /// @param _actionArgs The action arguments
    /// @return assetsToReceive_ The assets to be received
    function __decodeCloseAndSweepEscrows(IMysoV3OptionWritingPosition.CloseAndSweepEscrowActionArgs memory _actionArgs)
        internal
        view
        returns (address[] memory assetsToReceive_)
    {
        for (uint256 i = 0; i < _actionArgs.escrowIdxs.length; i++) {
            address[] memory escrows = MYSO_ROUTER.getEscrows(_actionArgs.escrowIdxs[i], 1);
            IMysoV3DataTypes.OptionInfo memory optionInfo = IMysoV3Escrow(escrows[0]).optionInfo();
            assetsToReceive_ = assetsToReceive_.addUniqueItem({_itemToAdd: optionInfo.underlyingToken});
            assetsToReceive_ = assetsToReceive_.addUniqueItem({_itemToAdd: optionInfo.settlementToken});
        }
        return assetsToReceive_;
    }

    /// @notice Parses the assets to be transferred for a CreateEscrowByTakingQuote action
    /// @param _actionArgs The action arguments
    /// @return assets_ The assets to be transferred
    /// @return amounts_ The amounts to be transferred
    /// @return assetsToReceive_ The assets to be received
    function __decodeCreateEscrowByTakingQuote(
        IMysoV3OptionWritingPosition.CreateEscrowByTakingQuoteActionArgs memory _actionArgs
    ) internal pure returns (address[] memory assets_, uint256[] memory amounts_, address[] memory assetsToReceive_) {
        assets_ = new address[](1);
        amounts_ = new uint256[](1);
        assetsToReceive_ = new address[](1);

        assets_[0] = _actionArgs.rfqInitialization.optionInfo.underlyingToken;
        amounts_[0] = _actionArgs.rfqInitialization.optionInfo.notional;
        assetsToReceive_[0] = _actionArgs.rfqInitialization.optionInfo.advancedSettings.premiumTokenIsUnderlying
            ? _actionArgs.rfqInitialization.optionInfo.underlyingToken
            : _actionArgs.rfqInitialization.optionInfo.settlementToken;
        return (assets_, amounts_, assetsToReceive_);
    }

    /// @notice Parses the assets to be transferred for a CreateEscrowByStartingAuction action
    /// @param _actionArgs The action arguments
    /// @return assets_ The assets to be transferred
    /// @return amounts_ The amounts to be transferred
    function __decodeCreateEscrowByStartingAuction(
        IMysoV3OptionWritingPosition.CreateEscrowByStartingAuctionActionArgs memory _actionArgs
    ) internal pure returns (address[] memory assets_, uint256[] memory amounts_) {
        assets_ = new address[](1);
        amounts_ = new uint256[](1);

        assets_[0] = _actionArgs.auctionInitialization.underlyingToken;
        amounts_[0] = _actionArgs.auctionInitialization.notional;
        return (assets_, amounts_);
    }

    /// @notice Parses the assets to be received for a WithdrawTokensFromEscrows action
    /// @param _actionArgs The action arguments
    /// @return assetsToReceive_ The assets to be received
    function __decodeWithdrawTokensFromEscrows(
        IMysoV3OptionWritingPosition.WithdrawTokensFromEscrowsActionArgs memory _actionArgs
    ) internal pure returns (address[] memory assetsToReceive_) {
        for (uint256 i = 0; i < _actionArgs.tokens.length; i++) {
            assetsToReceive_ = assetsToReceive_.addUniqueItem({_itemToAdd: _actionArgs.tokens[i]});
        }
    }

    /// @notice Parses the assets to be received for a Sweep action
    /// @param _actionArgs The action arguments
    /// @return assetsToReceive_ The assets to be received
    function __decodeSweep(IMysoV3OptionWritingPosition.SweepActionArgs memory _actionArgs)
        internal
        pure
        returns (address[] memory assetsToReceive_)
    {
        for (uint256 i = 0; i < _actionArgs.tokens.length; i++) {
            assetsToReceive_ = assetsToReceive_.addUniqueItem({_itemToAdd: _actionArgs.tokens[i]});
        }
    }
}
