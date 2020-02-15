pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./OrderFiller.sol";
import "../engine/Engine.sol";
import "../dependencies/DSMath.sol";
import "../dependencies/WETH.sol";
import "../dependencies/TokenUser.sol";

/// @notice Trading adapter to Melon Engine
contract EngineAdapter is DSMath, TokenUser, ExchangeAdapter, OrderFiller {
    /// @notice Buys Ether from the engine, selling MLN
    /// @param targetExchange Address of the engine
    /// @param orderValues [0] Min Eth to receive from the engine
    /// @param orderValues [1] MLN quantity
    /// @param orderValues [6] Same as orderValues[1]
    /// @param orderAddresses [2] WETH token
    /// @param orderAddresses [3] MLN token
    function takeOrder (
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    )
        public
        override
    {
        require(
            orderAddresses[2] == Registry(getHub().registry()).nativeAsset(),
            "maker asset doesnt match nativeAsset on registry"
        );
        require(
            orderValues[1] == orderValues[6],
            "fillTakerQuantity must equal takerAssetQuantity"
        );

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = formatFillTakeOrderArgs(orderAddresses, orderValues);

        fillTakeOrder(targetExchange, fillAssets, fillExpectedAmounts);
    }

    // INTERNAL FUNCTIONS
    function formatFillTakeOrderArgs(
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues
    )
        internal
        pure
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = _orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[1]; // taker fill amount

        return (fillAssets, fillExpectedAmounts);
    }

    function executeTakeOrderOnExchange(address _targetExchange, uint256 _expectedTakerAmount)
        internal
        returns (uint256 ethFilledAmount_)
    {
        uint256 preEthBalance = payable(address(this)).balance;
        Engine(_targetExchange).sellAndBurnMln(_expectedTakerAmount);
        ethFilledAmount_ = sub(payable(address(this)).balance, preEthBalance);
    }

    function fillTakeOrder(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
        validateAndFinalizeFilledOrder(
            _targetExchange,
            _fillAssets,
            _fillExpectedAmounts
        )
    {
        // Approve taker asset
        approveAsset(_fillAssets[1], _targetExchange, _fillExpectedAmounts[1], "takerAsset");

        // Fill order
        uint256 ethFilledAmount = executeTakeOrderOnExchange(_targetExchange, _fillExpectedAmounts[1]);

        // Return ETH to WETH
        WETH(payable(_fillAssets[0])).deposit.value(ethFilledAmount)();
    }
}
