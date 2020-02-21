pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../interfaces/IOasisDex.sol";
import "../libs/ExchangeAdapter.sol";
import "../libs/OrderTaker.sol";
import "../../fund/policies/TradingSignatures.sol";

/// @title OasisDexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract OasisDexAdapter is ExchangeAdapter, OrderTaker, TradingSignatures {
    /// @notice Extract arguments for risk management validations
    /// @param _methodSelector method selector of TAKE_ORDER, ...
    /// @param _encodedArgs Encoded arguments for a specific exchange
    /// @notice rskMngAddrs [0] makerAddress
    /// @notice rskMngAddrs [1] takerAddress
    /// @notice rskMngAddrs [2] makerAsset
    /// @notice rskMngAddrs [3] takerAsset
    /// @notice rskMngAddrs [4] makerFeeAsset
    /// @notice rskMngAddrs [5] takerFeeAsset
    /// @notice rskMngVals [0] makerAssetAmount
    /// @notice rskMngVals [1] takerAssetAmount
    /// @notice rskMngVals [2] fillAmout
    function extractRiskManagementArgsOf(
        bytes4 _methodSelector,
        bytes calldata _encodedArgs
    )
        external
        pure
        override
        returns (address[6] memory, uint256[3] memory)
    {
        address[6] memory rskMngAddrs;
        uint256[3] memory rskMngVals;

        if (_methodSelector == TAKE_ORDER) {
            (
                address[2] memory orderAddresses,
                uint256[2] memory orderValues,
            ) = __decodeTakeOrderArgs(_encodedArgs);

            rskMngAddrs = [
                address(0),
                address(this),
                orderAddresses[0],
                orderAddresses[1],
                address(0),
                address(0)
            ];
            rskMngVals = [
                orderValues[0],
                orderValues[1],
                orderValues[1]
            ];
        }
        else {
            revert("methodSelector doesn't exist");
        }

        return (rskMngAddrs, rskMngVals);
    }

    /// @notice Takes an active order on Oasis Dex (takeOrder)
    /// @param _targetExchange Address of the Oasis Dex exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [6] Taker asset fill quantity
    /// @param _identifier Order id on Oasis Dex
    /// @param _fillData Encoded data to pass to OrderFiller
    function __fillTakeOrder(
        address _targetExchange,
        bytes memory _encodedArgs,
        bytes memory _fillData
    )
        internal
        override
        validateAndFinalizeFilledOrder(_targetExchange, _fillData)
    {
        (
            ,,uint256 identifier
        ) = __decodeTakeOrderArgs(_encodedArgs);

        (,uint256[] memory fillExpectedAmounts,) = __decodeOrderFillData(_fillData);

        // Execute take order on exchange
        IOasisDex(_targetExchange).buy(uint256(identifier), fillExpectedAmounts[0]);
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _targetExchange Address of the Oasis Dex exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [6] Taker asset fill quantity
    /// @param _identifier Order id on Oasis Dex
    /// @return _fillAssets Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return _fillExpectedAmounts Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// @return _fillApprovalTargets Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] Oasis Dex exchange (_targetExchange)
    function __formatFillTakeOrderArgs(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        (
            address[2] memory orderAddresses,
            uint256[2] memory orderValues,
            uint256 identifier
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address[] memory fillAssets = new address[](2);
        fillAssets[0] = orderAddresses[0]; // maker asset
        fillAssets[1] = orderAddresses[1]; // taker asset

        (
            uint256 maxMakerQuantity,,uint256 maxTakerQuantity,
        ) = IOasisDex(_targetExchange).getOffer(uint256(identifier));

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = __calculateRelativeQuantity(
            maxTakerQuantity,
            maxMakerQuantity,
            orderValues[1]
        ); // maker fill amount
        fillExpectedAmounts[1] = orderValues[1]; // taker fill amount

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = _targetExchange; // Oasis Dex exchange

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _targetExchange Address of the Oasis Dex exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [6] Taker asset fill quantity
    /// @param _identifier Order id on Oasis Dex
    function __validateTakeOrderParams(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
    {
        (
            address[2] memory orderAddresses,
            uint256[2] memory orderValues,
            uint256 identifier
        ) = __decodeTakeOrderArgs(_encodedArgs);
        (
            ,
            address makerAsset,
            uint256 maxTakerQuantity,
            address takerAsset
        ) = IOasisDex(_targetExchange).getOffer(uint256(identifier));

        require(
            makerAsset == orderAddresses[0],
            "__validateTakeOrderParams: Order maker asset does not match the input"
        );
        require(
            takerAsset == orderAddresses[1],
            "__validateTakeOrderParams: Order taker asset does not match the input"
        );
        require(
            orderValues[1] <= maxTakerQuantity,
            "__validateTakeOrderParams: Taker fill amount greater than available quantity"
        );
    }

    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[2] memory orderAddresses,
            uint256[2] memory orderValues,
            uint256 identifier
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address[2],
                uint256[2],
                uint256
            )
        );
    }
}
