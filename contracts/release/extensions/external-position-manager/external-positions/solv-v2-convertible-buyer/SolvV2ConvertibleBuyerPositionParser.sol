// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
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
    using SafeCast for uint256;
    using SafeMath for uint256;

    address private constant NATIVE_TOKEN_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 private constant SOLV_FEE_RATE_DIVISOR = 10000;

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
            (uint24 offerId, uint128 units) = __decodeBuyOfferingActionArgs(_encodedActionArgs);


                ISolvV2InitialConvertibleOfferingMarket.Offering memory offering
             = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.offerings(offerId);

            uint256 voucherPrice = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.getPrice(offerId);


                ISolvV2InitialConvertibleOfferingMarket.Market memory market
             = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.markets(offering.voucher);
            uint256 amount = uint256(units).mul(voucherPrice).div(10**uint256(market.decimals));

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = offering.currency;
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.BuySaleByAmount)) {
            (uint24 saleId, uint256 amount) = __decodeBuySaleByAmountActionArgs(
                _encodedActionArgs
            );

            ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(saleId);

            __validateNotNativeToken(__getVoucherCurrencyFromTokenId(sale.voucher, sale.tokenId));

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = sale.currency;
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(ISolvV2ConvertibleBuyerPosition.Actions.BuySaleByUnits)) {
            (uint24 saleId, uint128 units) = __decodeBuySaleByUnitsActionArgs(_encodedActionArgs);

            ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(saleId);

            __validateNotNativeToken(__getVoucherCurrencyFromTokenId(sale.voucher, sale.tokenId));

            ISolvV2ConvertibleMarket.Market memory market = CONVERTIBLE_MARKET_CONTRACT.markets(
                sale.voucher
            );
            uint128 price = CONVERTIBLE_MARKET_CONTRACT.getPrice(saleId);
            uint256 amount = uint256(units).mul(uint256(price)).div(uint256(market.precision));

            // Fee logic copied from Solv's Convertible Marketplace internal _getFee helper
            if (
                CONVERTIBLE_MARKET_CONTRACT.markets(sale.voucher).feePayType ==
                ISolvV2ConvertibleMarket.FeePayType.BUYER_PAY
            ) {
                uint128 fee;
                if (market.feeType == ISolvV2ConvertibleMarket.FeeType.FIXED) {
                    fee = market.feeAmount;
                } else if (market.feeType == ISolvV2ConvertibleMarket.FeeType.BY_AMOUNT) {
                    fee = amount
                        .mul(uint256(market.feeRate))
                        .div(SOLV_FEE_RATE_DIVISOR)
                        .toUint128();
                } else {
                    revert("unsupported feeType");
                }

                // If buyer pays for fee, total amount is cost for units + fee
                amount = amount.add(fee);
            }

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
                address saleCurrency = sales[i].currency;
                __validateNotNativeToken(saleCurrency);

                if (assetsToReceive_.contains(saleCurrency)) {
                    continue;
                }

                if (ERC20(saleCurrency).balanceOf(_externalPosition) > 0) {
                    assetsToReceive_ = assetsToReceive_.addItem(saleCurrency);
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
                        assetsToReceive_ = new address[](1);
                        assetsToReceive_[0] = sales[i].currency;
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

    // PRIVATE FUNCTIONS

    function __getVoucherCurrencyFromTokenId(address _voucher, uint256 _tokenId)
        private
        view
        returns (address currency_)
    {
        ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(_voucher);

        return
            ISolvV2ConvertiblePool(voucherContract.convertiblePool())
                .getSlotDetail(voucherContract.slotOf(_tokenId))
                .fundCurrency;
    }

    /// @dev Helper to validate that assets are not the NATIVE_TOKEN_ADDRESS
    function __validateNotNativeToken(address _asset) private pure {
        require(
            _asset != NATIVE_TOKEN_ADDRESS,
            "__validateNotNativeToken: Native asset is unsupported"
        );
    }
}
