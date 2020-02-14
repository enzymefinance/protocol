pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./OrderFiller.sol";
import "../dependencies/WETH.sol";
import "../engine/IEngine.sol";

/// @notice Trading adapter to Melon Engine
contract EngineAdapter is ExchangeAdapter, OrderFiller {
    /// @notice Buys Ether from the Melon Engine, selling MLN
    /// @param _targetExchange Address of the engine
    /// @param _orderValues [0] Expected min ETH quantity (maker quantity)
    /// @param _orderValues [1] Expected MLN quantity (taker quantity)
    /// @param _orderValues [6] Same as orderValues[1]
    /// @param _orderAddresses [2] WETH token (maker asset)
    /// @param _orderAddresses [3] MLN token (taker asset)
    function takeOrder (
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
    {
        validateTakeOrderParams(_orderAddresses, _orderValues);

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = formatFillTakeOrderArgs(_orderAddresses, _orderValues);

        fillTakeOrder(_targetExchange, fillAssets, fillExpectedAmounts);
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

        // Fill order on Engine
        uint256 preEthBalance = payable(address(this)).balance;
        IEngine(_targetExchange).sellAndBurnMln(_fillExpectedAmounts[1]);
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Return ETH to WETH
        WETH(payable(_fillAssets[0])).deposit.value(ethFilledAmount)();
    }

    function validateTakeOrderParams(
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues
    )
        internal
        view
    {
        require(
            _orderAddresses[2] == getNativeAssetAddress(),
            "validateTakeOrderParams: maker asset does not match nativeAsset"
        );
        require(
            _orderAddresses[3] == getMlnTokenAddress(),
            "validateTakeOrderParams: taker asset does not match mlnToken"
        );
        require(
            _orderValues[1] == _orderValues[6],
            "validateTakeOrderParams: fill taker quantity must equal taker quantity"
        );
    }
}
