pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "main/exchanges/libs/ExchangeAdapter.sol";
import "main/exchanges/libs/OrderTaker.sol";

contract MockAdapter is ExchangeAdapter, OrderTaker {
    function extractTakeOrderRiskManagementArgs(
        bytes calldata _encodedArgs
    )
        external
        view
        override
        returns (address[6] memory, uint256[3] memory)
    {
        address[6] memory rskMngAddrs;
        uint256[3] memory rskMngVals;
        (
            address[2] memory orderAddresses,
            uint256[2] memory orderValues
        ) = __decodeTakeOrderArgs(_encodedArgs);

        rskMngAddrs = [
            address(0),
            address(0),
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

        return (rskMngAddrs, rskMngVals);
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
            address[2] memory orderAddresses,
            uint256[2] memory orderValues
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address makerAsset = orderAddresses[0];
        address takerAsset = orderAddresses[1];
        uint makerQuantity = orderValues[0];
        uint fillTakerQuantity = orderValues[1];

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
    }

    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[2] memory orderAddresses,
            uint256[2] memory orderValues
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address[2],
                uint256[2]
            )
        );
    }
}
