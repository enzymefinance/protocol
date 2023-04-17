// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../../persistent/address-list-registry/AddressListRegistry.sol";
import "../../../../utils/MathHelpers.sol";
import "../utils/actions/ZeroExV4ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title ZeroExV4Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter to 0xV4 Exchange Contract
contract ZeroExV4Adapter is AdapterBase, MathHelpers, ZeroExV4ActionsMixin {
    enum OrderType {
        Limit,
        Rfq
    }

    AddressListRegistry private immutable ADDRESS_LIST_REGISTRY_CONTRACT;
    uint256 private immutable ALLOWED_MAKERS_LIST_ID;

    /// @dev _allowedMakersListId of 0 is treated as a special case that allows any maker.
    constructor(
        address _integrationManager,
        address _exchange,
        address _addressListRegistry,
        uint256 _allowedMakersListId
    ) public AdapterBase(_integrationManager) ZeroExV4ActionsMixin(_exchange) {
        ADDRESS_LIST_REGISTRY_CONTRACT = AddressListRegistry(_addressListRegistry);
        ALLOWED_MAKERS_LIST_ID = _allowedMakersListId;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Take an order on 0x
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function takeOrder(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    ) external postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData) {
        (
            bytes memory encodedZeroExOrderArgs,
            uint128 takerAssetFillAmount,
            OrderType orderType
        ) = __decodeTakeOrderCallArgs(_actionData);

        if (orderType == OrderType.Limit) {
            (
                IZeroExV4.LimitOrder memory order,
                IZeroExV4.Signature memory signature
            ) = __decodeZeroExLimitOrderArgs(encodedZeroExOrderArgs);

            __zeroExV4TakeLimitOrder({
                _order: order,
                _signature: signature,
                _takerAssetFillAmount: takerAssetFillAmount
            });
        } else if (orderType == OrderType.Rfq) {
            (
                IZeroExV4.RfqOrder memory order,
                IZeroExV4.Signature memory signature
            ) = __decodeZeroExRfqOrderArgs(encodedZeroExOrderArgs);
            __zeroExV4TakeRfqOrder({
                _order: order,
                _signature: signature,
                _takerAssetFillAmount: takerAssetFillAmount
            });
        }
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(
        address,
        bytes4 _selector,
        bytes calldata _actionData
    )
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        require(_selector == TAKE_ORDER_SELECTOR, "parseAssetsForAction: _selector invalid");

        (
            bytes memory encodedZeroExOrderArgs,
            uint256 takerAssetFillAmount,
            OrderType orderType
        ) = __decodeTakeOrderCallArgs(_actionData);

        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);
        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);

        address maker;
        uint256 takerAmount;
        uint256 takerTokenFeeAmount;

        if (orderType == OrderType.Limit) {
            (IZeroExV4.LimitOrder memory order, ) = __decodeZeroExLimitOrderArgs(
                encodedZeroExOrderArgs
            );

            maker = order.maker;
            incomingAssets_[0] = order.makerToken;
            spendAssets_[0] = order.takerToken;
            takerAmount = order.takerAmount;
            takerTokenFeeAmount = order.takerTokenFeeAmount;
        } else if (orderType == OrderType.Rfq) {
            (IZeroExV4.RfqOrder memory order, ) = __decodeZeroExRfqOrderArgs(
                encodedZeroExOrderArgs
            );
            maker = order.maker;
            incomingAssets_[0] = order.makerToken;
            spendAssets_[0] = order.takerToken;
            takerAmount = order.takerAmount;
        }

        require(isAllowedMaker(maker), "parseAssetsForAction: Order maker is not allowed");

        if (takerTokenFeeAmount > 0) {
            // Fee is always in takerToken
            // Fee calculated relative to taker fill amount
            spendAssetAmounts_[0] = takerAssetFillAmount.add(
                __calcRelativeQuantity({
                    _quantity1: takerAmount,
                    _quantity2: takerTokenFeeAmount,
                    _relativeQuantity1: takerAssetFillAmount
                })
            );
        } else {
            spendAssetAmounts_[0] = takerAssetFillAmount;
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Decode the parameters of a takeOrder call
    /// @param _actionData Encoded parameters passed from client side
    /// @return encodedZeroExOrderArgs_ Encoded args of the 0x order
    /// @return takerAssetFillAmount_ Amount of taker asset to fill
    function __decodeTakeOrderCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            bytes memory encodedZeroExOrderArgs_,
            uint128 takerAssetFillAmount_,
            OrderType orderType
        )
    {
        return abi.decode(_actionData, (bytes, uint128, OrderType));
    }

    /// @dev Decode the parameters of a 0x limit order
    function __decodeZeroExLimitOrderArgs(bytes memory _encodedZeroExOrderArgs)
        private
        pure
        returns (IZeroExV4.LimitOrder memory order_, IZeroExV4.Signature memory signature_)
    {
        return abi.decode(_encodedZeroExOrderArgs, (IZeroExV4.LimitOrder, IZeroExV4.Signature));
    }

    /// @dev Decode the parameters of a 0x rfq order
    function __decodeZeroExRfqOrderArgs(bytes memory _encodedZeroExOrderArgs)
        private
        pure
        returns (IZeroExV4.RfqOrder memory order_, IZeroExV4.Signature memory signature_)
    {
        return abi.decode(_encodedZeroExOrderArgs, (IZeroExV4.RfqOrder, IZeroExV4.Signature));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Checks whether an account is an allowed maker of 0x orders
    /// @param _who The account to check
    /// @return isAllowedMaker_ True if _who is an allowed maker
    function isAllowedMaker(address _who) public view returns (bool isAllowedMaker_) {
        return
            ALLOWED_MAKERS_LIST_ID == 0 ||
            ADDRESS_LIST_REGISTRY_CONTRACT.isInList(ALLOWED_MAKERS_LIST_ID, _who);
    }
}
