// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {SafeMath} from "openzeppelin-solc-0.6/math/SafeMath.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {ISolvV2BondPool} from "../../../../../external-interfaces/ISolvV2BondPool.sol";
import {ISolvV2BondVoucher} from "../../../../../external-interfaces/ISolvV2BondVoucher.sol";
import {ISolvV2InitialConvertibleOfferingMarket} from
    "../../../../../external-interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";
import {AddressArrayLib} from "../../../../../utils/0.6.12/AddressArrayLib.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {ISolvV2BondIssuerPosition} from "./ISolvV2BondIssuerPosition.sol";
import {SolvV2BondIssuerPositionDataDecoder} from "./SolvV2BondIssuerPositionDataDecoder.sol";
import {SolvV2BondIssuerPositionLib} from "./SolvV2BondIssuerPositionLib.sol";

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title SolvV2BondIssuerPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Solv V2 Bond Issuer positions
contract SolvV2BondIssuerPositionParser is IExternalPositionParser, SolvV2BondIssuerPositionDataDecoder {
    using AddressArrayLib for address[];
    using SafeMath for uint256;

    address private constant NATIVE_TOKEN_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    ISolvV2InitialConvertibleOfferingMarket private immutable INITIAL_BOND_OFFERING_MARKET_CONTRACT;

    constructor(address _initialBondOfferingMarket) public {
        INITIAL_BOND_OFFERING_MARKET_CONTRACT = ISolvV2InitialConvertibleOfferingMarket(_initialBondOfferingMarket);
    }

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
        if (_actionId == uint256(ISolvV2BondIssuerPosition.Actions.CreateOffer)) {
            (
                address voucher,
                address currency,
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                ISolvV2InitialConvertibleOfferingMarket.MintParameter memory mintParameter
            ) = __decodeCreateOfferActionArgs(_encodedActionArgs);

            __validateNotNativeToken(currency);

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = ISolvV2BondVoucher(voucher).underlying();
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = mintParameter.tokenInAmount;
        } else if (_actionId == uint256(ISolvV2BondIssuerPosition.Actions.Reconcile)) {
            uint24[] memory offersMem = ISolvV2BondIssuerPosition(_externalPosition).getOffers();
            uint256 offersLength = offersMem.length;
            for (uint256 i; i < offersLength; i++) {
                address currency = INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(offersMem[i]).currency;
                if (IERC20(currency).balanceOf(_externalPosition) > 0) {
                    assetsToReceive_ = assetsToReceive_.addUniqueItem(currency);
                }
            }
        } else if (_actionId == uint256(ISolvV2BondIssuerPosition.Actions.Refund)) {
            (address voucher, uint256 slotId) = __decodeRefundActionArgs(_encodedActionArgs);

            ISolvV2BondPool voucherPoolContract = ISolvV2BondPool(ISolvV2BondVoucher(voucher).bondPool());

            ISolvV2BondPool.SlotDetail memory slotDetail = voucherPoolContract.getSlotDetail(slotId);

            uint256 currencyAmount = slotDetail.totalValue.mul(
                10 ** uint256(IERC20(slotDetail.fundCurrency).decimals())
            ).div(10 ** uint256(voucherPoolContract.valueDecimals()));

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = slotDetail.fundCurrency;
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = currencyAmount;
        } else if (_actionId == uint256(ISolvV2BondIssuerPosition.Actions.RemoveOffer)) {
            uint24 offerId = __decodeRemoveOfferActionArgs(_encodedActionArgs);

            ISolvV2InitialConvertibleOfferingMarket.Offering memory offer =
                INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(offerId);

            // If offer has remaining unsold units, some underlying is refunded
            if (offer.units > 0) {
                assetsToReceive_ = new address[](1);
                assetsToReceive_[0] = ISolvV2BondVoucher(offer.voucher).underlying();
            }

            if (IERC20(offer.currency).balanceOf(_externalPosition) > 0) {
                assetsToReceive_ = assetsToReceive_.addItem(offer.currency);
            }
        } else if (_actionId == uint256(ISolvV2BondIssuerPosition.Actions.Withdraw)) {
            (address voucher,) = __decodeWithdrawActionArgs(_encodedActionArgs);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = ISolvV2BondVoucher(voucher).underlying();
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}

    // PRIVATE FUNCTIONS

    /// @dev Helper to validate that assets are not the NATIVE_TOKEN_ADDRESS
    function __validateNotNativeToken(address _asset) private pure {
        require(_asset != NATIVE_TOKEN_ADDRESS, "__validateNotNativeToken: Native asset is unsupported");
    }
}
