// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../../external-interfaces/ISolvV2BondPool.sol";
import "../../../../../external-interfaces/ISolvV2BondVoucher.sol";
import "../../../../../external-interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";
import "../IExternalPositionParser.sol";
import "./ISolvV2BondBuyerPosition.sol";
import "./SolvV2BondBuyerPositionDataDecoder.sol";

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title SolvV2BondBuyerPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Solv Bond Buyer positions
contract SolvV2BondBuyerPositionParser is
    IExternalPositionParser,
    SolvV2BondBuyerPositionDataDecoder
{
    using SafeMath for uint256;

    ISolvV2InitialConvertibleOfferingMarket
        private immutable INITIAL_BOND_OFFERING_MARKET_CONTRACT;

    constructor(address _initialBondOfferingMarket) public {
        INITIAL_BOND_OFFERING_MARKET_CONTRACT = ISolvV2InitialConvertibleOfferingMarket(
            _initialBondOfferingMarket
        );
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(
        address,
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
        if (_actionId == uint256(ISolvV2BondBuyerPosition.Actions.BuyOffering)) {
            (uint24 offerId, uint128 units) = __decodeBuyOfferingActionArgs(_encodedActionArgs);

            ISolvV2InitialConvertibleOfferingMarket.Offering
                memory offering = INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(offerId);

            uint256 voucherPrice = INITIAL_BOND_OFFERING_MARKET_CONTRACT.getPrice(offerId);

            ISolvV2InitialConvertibleOfferingMarket.Market
                memory market = INITIAL_BOND_OFFERING_MARKET_CONTRACT.markets(offering.voucher);
            uint256 amount = uint256(units).mul(voucherPrice).div(10**uint256(market.decimals));

            assetsToTransfer_ = new address[](1);
            assetsToTransfer_[0] = offering.currency;
            amountsToTransfer_ = new uint256[](1);
            amountsToTransfer_[0] = amount;
        } else if (_actionId == uint256(ISolvV2BondBuyerPosition.Actions.Claim)) {
            (address voucher, uint256 tokenId, ) = __decodeClaimActionArgs(_encodedActionArgs);

            ISolvV2BondVoucher voucherContract = ISolvV2BondVoucher(voucher);

            uint256 slotId = voucherContract.voucherSlotMapping(tokenId);
            ISolvV2BondPool.SlotDetail memory slotDetail = voucherContract.getSlotDetail(slotId);

            assetsToReceive_ = new address[](2);
            assetsToReceive_[0] = voucherContract.underlying();
            assetsToReceive_[1] = slotDetail.fundCurrency;
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {}
}
