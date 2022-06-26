// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../interfaces/ISolvV2ConvertibleMarket.sol";
import "../../../../interfaces/ISolvV2ConvertiblePool.sol";
import "../../../../interfaces/ISolvV2ConvertibleVoucher.sol";
import "../../../../interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../IExternalPositionParser.sol";
import "./ISolvV2ConvertibleBuyerPosition.sol";
import "./SolvV2ConvertibleBuyerPositionLib.sol";
import "./SolvV2ConvertibleBuyerPositionDataDecoder.sol";

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title SolvV2ConvertibleBuyerPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Solv Convertible Buyer positions
contract SolvV2ConvertibleBuyerPositionParser is
    IExternalPositionParser,
    SolvV2ConvertibleBuyerPositionDataDecoder
{
    using AddressArrayLib for address[];
    using SafeMath for uint256;

    ISolvV2ConvertibleMarket private immutable CONVERTIBLE_MARKET_CONTRACT;
    ISolvV2InitialConvertibleOfferingMarket
        private immutable INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT;

    constructor(address _convertibleMarket, address _initialConvertibleOfferingMarket) public {
        CONVERTIBLE_MARKET_CONTRACT = ISolvV2ConvertibleMarket(_convertibleMarket);
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
        if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.BuyOffering)) {
            (address voucher, uint24 offerId, uint128 units) = __decodeBuyOfferingActionArgs(
                _encodedActionArgs
            );


                ISolvV2InitialConvertibleOfferingMarket.Offering memory offering
             = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.offerings(offerId);

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = offering.currency;

            uint256 voucherPrice = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.getPrice(offerId);


                ISolvV2InitialConvertibleOfferingMarket.Market memory market
             = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.markets(voucher);
            uint256 amount = uint256(units).mul(voucherPrice).div(10**uint256(market.decimals));

            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.BuySaleByAmount)) {
            (uint24 saleId, uint256 amount) = __decodeBuySaleByAmountActionArgs(
                _encodedActionArgs
            );

            ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(saleId);
            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = sale.currency;
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.BuySaleByUnits)) {
            (uint24 saleId, uint128 units) = __decodeBuySaleByUnitsActionArgs(_encodedActionArgs);

            ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(saleId);

            ISolvV2ConvertibleMarket.Market memory market = CONVERTIBLE_MARKET_CONTRACT.markets(
                sale.voucher
            );
            uint128 price = CONVERTIBLE_MARKET_CONTRACT.getPrice(saleId);
            uint256 amount = uint256(units).mul(uint256(price)).div(uint256(market.precision));

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = sale.currency;
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.Claim)) {
            (address voucher, uint256 tokenId, ) = __decodeClaimActionArgs(_encodedActionArgs);

            ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(voucher);

            uint256 slotId = voucherContract.voucherSlotMapping(tokenId);
            ISolvV2ConvertiblePool.SlotDetail memory slotDetail = voucherContract.getSlotDetail(
                slotId
            );

            assetsToReceive_ = new address[](2);
            assetsToReceive_[0] = voucherContract.underlying();
            assetsToReceive_[1] = slotDetail.fundCurrency;
        } else if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.Reconcile)) {

                ISolvV2ConvertibleBuyerPosition externalPositionContract
             = ISolvV2ConvertibleBuyerPosition(_externalPosition);

            SolvV2ConvertibleBuyerPositionLib.Sale[] memory sales = externalPositionContract
                .getSales();
            uint256 salesLength = sales.length;
            for (uint256 i; i < salesLength; i++) {
                if (ERC20(sales[i].currency).balanceOf(_externalPosition) > 0) {
                    assetsToReceive_.addUniqueItem(sales[i].currency);
                }
            }
        } else if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.RemoveSale)) {
            uint24 saleId = __decodeRemoveSaleActionArgs(_encodedActionArgs);


                ISolvV2ConvertibleBuyerPosition externalPositionContract
             = ISolvV2ConvertibleBuyerPosition(_externalPosition);

            SolvV2ConvertibleBuyerPositionLib.Sale[] memory sales = externalPositionContract
                .getSales();
            uint256 salesLength = sales.length;
            for (uint256 i; i < salesLength; i++) {
                if (sales[i].saleId == saleId) {
                    if (ERC20(sales[i].currency).balanceOf(_externalPosition) > 0) {
                        assetsToReceive_.addUniqueItem(sales[i].currency);
                    }
                    break;
                }
            }
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
