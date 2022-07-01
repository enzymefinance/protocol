// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../interfaces/ISolvV2ConvertiblePool.sol";
import "../../../../interfaces/ISolvV2ConvertibleVoucher.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../IExternalPositionParser.sol";
import "./ISolvV2ConvertibleIssuerPosition.sol";
import "./SolvV2ConvertibleIssuerPositionDataDecoder.sol";
import "./SolvV2ConvertibleIssuerPositionLib.sol";

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title SolvV2ConvertibleIssuerPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Solv V2 Convertible Issuer positions
contract SolvV2ConvertibleIssuerPositionParser is
    IExternalPositionParser,
    SolvV2ConvertibleIssuerPositionDataDecoder
{
    using AddressArrayLib for address[];
    using SafeMath for uint256;

    ISolvV2InitialConvertibleOfferingMarket
        private immutable INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT;

    constructor(address _initialConvertibleOfferingMarket) public {
        INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT = ISolvV2InitialConvertibleOfferingMarket(
            _initialConvertibleOfferingMarket
        );
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPosition The _externalPosition to be called
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(
        address _externalPosition,
        uint256 _actionId,
        bytes memory _encodedActionArgs
    )
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(ISolvV2ConvertibleIssuerPosition.Actions.CreateOffer)) {
            (
                address voucher,
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                ISolvV2InitialConvertibleOfferingMarket.MintParameter memory mintParameter
            ) = __decodeCreateOfferActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = ISolvV2ConvertibleVoucher(voucher).underlying();
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = mintParameter.tokenInAmount;
        } else if (_actionId == uint256(ISolvV2ConvertibleIssuerPosition.Actions.Reconcile)) {

                SolvV2ConvertibleIssuerPositionLib.Offer[] memory offersMem
             = ISolvV2ConvertibleIssuerPosition(_externalPosition).getOffers();
            uint256 offersLength = offersMem.length;
            for (uint256 i; i < offersLength; i++) {
                if (ERC20(offersMem[i].currency).balanceOf(_externalPosition) > 0) {
                    assetsToReceive_.addUniqueItem(offersMem[i].currency);
                }
            }
        } else if (_actionId == uint256(ISolvV2ConvertibleIssuerPosition.Actions.Refund)) {
            (address voucher, uint256 slotId) = __decodeRefundActionArgs(_encodedActionArgs);

            ISolvV2ConvertiblePool voucherPoolContract = ISolvV2ConvertiblePool(
                ISolvV2ConvertibleVoucher(voucher).convertiblePool()
            );

            ISolvV2ConvertiblePool.SlotDetail memory slotDetail = voucherPoolContract
                .getSlotDetail(slotId);

            uint256 currencyAmount = slotDetail
                .totalValue
                .mul(10**uint256(ERC20(slotDetail.fundCurrency).decimals()))
                .div(10**uint256(voucherPoolContract.valueDecimals()));

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = slotDetail.fundCurrency;
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = currencyAmount;
        } else if (_actionId == uint256(ISolvV2ConvertibleIssuerPosition.Actions.RemoveOffer)) {
            uint24 offerId = __decodeRemoveOfferActionArgs(_encodedActionArgs);


                ISolvV2InitialConvertibleOfferingMarket.Offering memory offer
             = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.offerings(offerId);

            // If offer has remaining unsold units, some underlying is refunded
            if (offer.units > 0) {
                assetsToReceive_ = new address[](1);
                assetsToReceive_[0] = ISolvV2ConvertibleVoucher(offer.voucher).underlying();
            }

            if (ERC20(offer.currency).balanceOf(_externalPosition) > 0) {
                assetsToReceive_.addItem(offer.currency);
            }
        } else if (_actionId == uint256(ISolvV2ConvertibleIssuerPosition.Actions.Withdraw)) {
            (address voucher, uint256 slotId) = __decodeWithdrawActionArgs(_encodedActionArgs);

            ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(voucher);

            // Adding both assets since it is expensive to calculate which ones will be received
            assetsToReceive_ = new address[](2);
            assetsToReceive_[0] = voucherContract.underlying();
            assetsToReceive_[1] = voucherContract.getSlotDetail(slotId).fundCurrency;
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
