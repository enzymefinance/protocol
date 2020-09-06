// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../../utils/MathHelpers.sol";
import "../interfaces/IZeroExV2.sol";
import "../utils/AdapterBase.sol";

/// @title ZeroExV2Adapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter to 0xV2 Exchange Contract
contract ZeroExV2Adapter is AdapterBase, MathHelpers {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address private immutable EXCHANGE;

    constructor(address _integrationManager, address _exchange)
        public
        AdapterBase(_integrationManager)
    {
        EXCHANGE = _exchange;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external override pure returns (string memory) {
        return "ZERO_EX_V2";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        override
        view
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == TAKE_ORDER_SELECTOR) {
            (
                bytes memory encodedZeroExOrderArgs,
                uint256 takerAssetFillAmount
            ) = __decodeTakeOrderCallArgs(_encodedCallArgs);
            IZeroExV2.Order memory order = __constructOrderStruct(encodedZeroExOrderArgs);
            address makerAsset = __getAssetAddress(order.makerAssetData);
            address takerFeeAsset = __getAssetAddress(IZeroExV2(EXCHANGE).ZRX_ASSET_DATA());
            uint256 takerFee = __calcRelativeQuantity(
                order.takerAssetAmount,
                order.takerFee,
                takerAssetFillAmount
            ); // fee calculated relative to taker fill amount

            // Format spend assets
            address[] memory rawSpendAssets = new address[](2);
            rawSpendAssets[0] = __getAssetAddress(order.takerAssetData);
            rawSpendAssets[1] = takerFeeAsset;
            uint256[] memory rawSpendAssetAmounts = new uint256[](2);
            rawSpendAssetAmounts[0] = takerAssetFillAmount;
            // Set spend amount to 0 for taker fee if the asset is the same as the maker asset,
            // as it can be deducted from the amount received
            rawSpendAssetAmounts[1] = takerFeeAsset == makerAsset ? 0 : takerFee;
            (spendAssets_, spendAssetAmounts_) = __aggregateAssets(
                rawSpendAssets,
                rawSpendAssetAmounts
            );

            // Format incoming assets
            incomingAssets_ = new address[](1);
            incomingAssets_[0] = makerAsset;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = __calcRelativeQuantity(
                order.takerAssetAmount,
                order.makerAssetAmount,
                takerAssetFillAmount
            );
            // If there is a taker fee and the maker asset is zrx, need to subtract fee
            if (takerFee > 0 && makerAsset == takerFeeAsset) {
                minIncomingAssetAmounts_[0] = minIncomingAssetAmounts_[0].sub(takerFee);
            }
        } else {
            revert("parseIncomingAssets: _selector invalid");
        }
    }

    /// @notice Take order on 0x Protocol
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function takeOrder(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            bytes memory encodedZeroExOrderArgs,
            uint256 takerAssetFillAmount
        ) = __decodeTakeOrderCallArgs(_encodedCallArgs);
        IZeroExV2.Order memory order = __constructOrderStruct(encodedZeroExOrderArgs);

        // Validate args
        require(
            takerAssetFillAmount <= order.takerAssetAmount,
            "takeOrder: Taker asset fill amount greater than available"
        );

        // Approve spend assets
        IERC20(__getAssetAddress(order.takerAssetData)).safeIncreaseAllowance(
            __getAssetProxy(order.takerAssetData),
            takerAssetFillAmount
        );
        if (order.takerFee > 0) {
            bytes memory zrxData = IZeroExV2(EXCHANGE).ZRX_ASSET_DATA();
            // Approve spend assets
            IERC20(__getAssetAddress(zrxData)).safeIncreaseAllowance(
                __getAssetProxy(zrxData),
                __calcRelativeQuantity(
                    order.takerAssetAmount,
                    order.takerFee,
                    takerAssetFillAmount
                ) // fee calculated relative to taker fill amount
            );
        }

        // Execute order
        (, , , bytes memory signature) = __decodeZeroExOrderArgs(encodedZeroExOrderArgs);
        IZeroExV2(EXCHANGE).fillOrder(order, takerAssetFillAmount, signature);
    }

    // PRIVATE FUNCTIONS

    /// @notice Parses user inputs into a ZeroExV2.Order format
    function __constructOrderStruct(bytes memory _encodedOrderArgs)
        private
        pure
        returns (IZeroExV2.Order memory order)
    {
        (
            address[4] memory orderAddresses,
            uint256[6] memory orderValues,
            bytes[2] memory orderData,

        ) = __decodeZeroExOrderArgs(_encodedOrderArgs);

        order = IZeroExV2.Order({
            makerAddress: orderAddresses[0],
            takerAddress: orderAddresses[1],
            feeRecipientAddress: orderAddresses[2],
            senderAddress: orderAddresses[3],
            makerAssetAmount: orderValues[0],
            takerAssetAmount: orderValues[1],
            makerFee: orderValues[2],
            takerFee: orderValues[3],
            expirationTimeSeconds: orderValues[4],
            salt: orderValues[5],
            makerAssetData: orderData[0],
            takerAssetData: orderData[1]
        });
    }

    /// @notice Gets the 0x assetProxy address for an ERC20 token
    function __getAssetProxy(bytes memory _assetData) private view returns (address assetProxy_) {
        bytes4 assetProxyId;

        assembly {
            assetProxyId := and(
                mload(add(_assetData, 32)),
                0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }
        assetProxy_ = IZeroExV2(EXCHANGE).getAssetProxy(assetProxyId);
    }

    /// @notice Parses the asset address from 0x assetData
    function __getAssetAddress(bytes memory _assetData)
        private
        pure
        returns (address assetAddress_)
    {
        assembly {
            assetAddress_ := mload(add(_assetData, 36))
        }
    }

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedCallArgs Encoded parameters passed from client side
    /// @return encodedZeroExOrderArgs_ Encoded args of the 0x order
    /// @return takerAssetFillAmount_ Amount of taker asset to fill
    function __decodeTakeOrderCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (bytes memory encodedZeroExOrderArgs_, uint256 takerAssetFillAmount_)
    {
        return abi.decode(_encodedCallArgs, (bytes, uint256));
    }

    /// @dev Decode the parameters of a 0x order
    /// @param _encodedZeroExOrderArgs Encoded parameters of the 0x order
    /// @return orderAddresses_ Addresses used in the order
    /// - [0] 0x Order param: makerAddress
    /// - [1] 0x Order param: takerAddress
    /// - [2] 0x Order param: feeRecipientAddress
    /// - [3] 0x Order param: senderAddress
    /// @return orderValues_ Values used in the order
    /// - [0] 0x Order param: makerAssetAmount
    /// - [1] 0x Order param: takerAssetAmount
    /// - [2] 0x Order param: makerFee
    /// - [3] 0x Order param: takerFee
    /// - [4] 0x Order param: expirationTimeSeconds
    /// - [5] 0x Order param: salt
    /// @return orderData_ Bytes data used in the order
    /// - [0] 0x Order param: makerAssetData
    /// - [1] 0x Order param: takerAssetData
    /// @return signature_ Signature of the order
    function __decodeZeroExOrderArgs(bytes memory _encodedZeroExOrderArgs)
        private
        pure
        returns (
            address[4] memory orderAddresses_,
            uint256[6] memory orderValues_,
            bytes[2] memory orderData_,
            bytes memory signature_
        )
    {
        return abi.decode(_encodedZeroExOrderArgs, (address[4], uint256[6], bytes[2], bytes));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getExchange() external view returns (address) {
        return EXCHANGE;
    }
}
