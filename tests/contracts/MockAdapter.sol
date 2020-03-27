pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "main/exchanges/libs/ExchangeAdapter.sol";
import "main/exchanges/libs/OrderTaker.sol";

contract MockAdapter is ExchangeAdapter, OrderTaker {
    /// @notice Mock extracting arguments for risk management validations
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return riskManagementAddresses needed addresses for risk management
    /// - [0] Maker address
    /// - [1] Taker address
    /// - [2] Maker asset
    /// - [3] Taker asset
    /// - [4] Maker fee asset
    /// - [5] Taker fee asset
    /// @return riskManagementValues needed values for risk management
    /// - [0] Maker asset amount
    /// - [1] Taker asset amount
    /// - [2] Taker asset fill amount
    function extractTakeOrderRiskManagementArgs(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
        returns (address[6] memory, uint256[3] memory)
    {
        return __decodeTakeOrderArgs(_encodedArgs);
    }

    /// @notice Mock take order
    function __fillTakeOrder(
        address _targetExchange,
        bytes memory _encodedArgs,
        bytes memory _fillData
    )
        internal
        override
    {
        (
            address[6] memory orderAddresses,
            uint256[3] memory orderValues
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint makerQuantity = orderValues[0];
        uint fillTakerQuantity = orderValues[2];

        __approveAsset(takerAsset, _targetExchange, fillTakerQuantity, "takerAsset");
        __getAccounting().decreaseAssetBalance(takerAsset, fillTakerQuantity);
        __getAccounting().increaseAssetBalance(makerAsset, makerQuantity);

        emit OrderFilled(
            _targetExchange,
            makerAsset,
            makerQuantity,
            takerAsset,
            fillTakerQuantity,
            new address[](0),
            new uint256[](0)
        );
    }

    function __formatFillTakeOrderArgs(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        address[] memory fillAssets = new address[](2);
        uint256[] memory fillExpectedAmounts = new uint256[](2);
        address[] memory fillApprovalTargets = new address[](2);

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    function __validateTakeOrderParams(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
    {
        (
            address[6] memory orderAddresses,
            uint256[3] memory orderValues
        ) = __decodeTakeOrderArgs(_encodedArgs);

        IRegistry registry = IRegistry(__getRoutes().registry);
        require(registry.assetIsRegistered(
            orderAddresses[2]), 'Maker asset not registered'
        );
        require(registry.assetIsRegistered(
            orderAddresses[3]), 'Taker asset not registered'
        );
        if (orderAddresses[5] != address(0)) {
            require(
                registry.assetIsRegistered(orderAddresses[5]),
                'Taker fee asset not registered'
            );
        }
    }

    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[6] memory orderAddresses,
            uint256[3] memory orderValues
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address[6],
                uint256[3]
            )
        );
    }
}
