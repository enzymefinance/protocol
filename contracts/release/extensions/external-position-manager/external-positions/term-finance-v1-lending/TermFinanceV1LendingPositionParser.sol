// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {ITermFinanceV1Auction} from "../../../../../external-interfaces/ITermFinanceV1Auction.sol";
import {ITermFinanceV1Controller} from "../../../../../external-interfaces/ITermFinanceV1Controller.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {ITermFinanceV1LendingPosition} from "./ITermFinanceV1LendingPosition.sol";
import {TermFinanceV1LendingPositionDataDecoder} from "./TermFinanceV1LendingPositionDataDecoder.sol";

pragma solidity 0.8.19;

/// @title TermFinanceV1LendingPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Term Finance V1 Lending Positions
contract TermFinanceV1LendingPositionParser is TermFinanceV1LendingPositionDataDecoder, IExternalPositionParser {
    using AddressArrayLib for address[];

    ITermFinanceV1Controller private immutable TERM_FINANCE_V1_CONTROLLER;

    constructor(address _termControllerAddress) {
        TERM_FINANCE_V1_CONTROLLER = ITermFinanceV1Controller(_termControllerAddress);
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
        if (_actionId == uint256(ITermFinanceV1LendingPosition.Actions.AddOrUpdateOffers)) {
            (
                ITermFinanceV1Auction termAuction,
                bytes32[] memory offerIds,
                bytes32[] memory offerPriceHashes,
                int256[] memory underlyingAmountsChange
            ) = __decodeAddOrUpdateOffersActionArgs(_encodedActionArgs);

            __validateTermAuction(termAuction);

            uint256 underlyingAmountsChangeLength = underlyingAmountsChange.length;

            require(
                offerIds.length == underlyingAmountsChangeLength
                    && offerPriceHashes.length == underlyingAmountsChangeLength,
                "parseAssetsForAction: Unequal arrays"
            );

            uint256 amountToTransfer;
            address purchaseToken = termAuction.purchaseToken();

            for (uint256 i; i < underlyingAmountsChangeLength; i++) {
                if (underlyingAmountsChange[i] > 0) {
                    amountToTransfer += uint256(underlyingAmountsChange[i]);
                } else {
                    // If an amountChange is negative, we will receive some purchaseToken
                    if (assetsToReceive_.length == 0) {
                        assetsToReceive_ = new address[](1);
                        assetsToReceive_[0] = purchaseToken;
                    }
                }
            }

            if (amountToTransfer > 0) {
                assetsToTransfer_ = new address[](1);
                amountsToTransfer_ = new uint256[](1);
                assetsToTransfer_[0] = purchaseToken;
                amountsToTransfer_[0] = amountToTransfer;
            }
        } else if (_actionId == uint256(ITermFinanceV1LendingPosition.Actions.RemoveOffers)) {
            (ITermFinanceV1Auction termAuction,) = __decodeRemoveOffersActionArgs(_encodedActionArgs);

            __validateTermAuction(termAuction);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = termAuction.purchaseToken();
        } else if (_actionId == uint256(ITermFinanceV1LendingPosition.Actions.Redeem)) {
            (ITermFinanceV1Auction termAuction,) = __decodeRedeemActionArgs(_encodedActionArgs);

            __validateTermAuction(termAuction);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = termAuction.purchaseToken();
        } else if (_actionId == uint256(ITermFinanceV1LendingPosition.Actions.Sweep)) {
            (ITermFinanceV1Auction[] memory termAuctions) = __decodeSweepActionArgs(_encodedActionArgs);

            for (uint256 i; i < termAuctions.length; i++) {
                __validateTermAuction(termAuctions[i]);
                // Add the purchaseToken from each termAuction
                assetsToReceive_ =
                    assetsToReceive_.addUniqueItem(ITermFinanceV1Auction(termAuctions[i]).purchaseToken());
            }
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    function parseInitArgs(address, bytes memory) external pure override returns (bytes memory) {
        return "";
    }

    /// @dev Helper to validate that a Term Finance auction is canonical
    function __validateTermAuction(ITermFinanceV1Auction _termAuction) private view {
        require(
            TERM_FINANCE_V1_CONTROLLER.isTermDeployed(address(_termAuction)),
            "__validateTermAuction: invalid term auction"
        );
    }
}
