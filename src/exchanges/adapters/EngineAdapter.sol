pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../libs/ExchangeAdapter.sol";
import "../libs/OrderTaker.sol";
import "../../dependencies/WETH.sol";
import "../../engine/IEngine.sol";

/// @title EngineAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Trading adapter to Melon Engine
contract EngineAdapter is ExchangeAdapter, OrderTaker {
    /// @notice Buys Ether from the Melon Engine, selling MLN (takeOrder)
    /// @param _targetExchange Address of the Melon Engine
    /// @param _orderValues [0] Expected min ETH quantity (maker quantity)
    /// @param _orderValues [1] Expected MLN quantity (taker quantity)
    /// @param _orderValues [6] Same as orderValues[1]
    /// @param _orderAddresses [2] WETH token (maker asset)
    /// @param _orderAddresses [3] MLN token (taker asset)
    /// @param _fillData Encoded data to pass to OrderFiller
    function __fillTakeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature,
        bytes memory _fillData
    )
        internal
        override
        validateAndFinalizeFilledOrder(_targetExchange, _fillData)
    {
        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts,
        ) = __decodeOrderFillData(_fillData);

        // Fill order on Engine
        uint256 preEthBalance = payable(address(this)).balance;
        IEngine(_targetExchange).sellAndBurnMln(fillExpectedAmounts[1]);
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Return ETH to WETH
        WETH(payable(fillAssets[0])).deposit.value(ethFilledAmount)();
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _targetExchange Address of the Melon Engine
    /// @param _orderValues [0] Expected min ETH quantity (maker quantity)
    /// @param _orderValues [1] Expected MLN quantity (taker quantity)
    /// @param _orderValues [6] Same as orderValues[1]
    /// @param _orderAddresses [2] WETH token (maker asset)
    /// @param _orderAddresses [3] MLN token (taker asset)
    /// @return _fillAssets Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return _fillExpectedAmounts Asset fill amounts
    /// - [0] Expected (min) quantity of WETH to receive
    /// - [1] Expected (max) quantity of MLN to spend
    /// @return _fillApprovalTargets Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] Melon Engine (_targetExchange)
    function __formatFillTakeOrderArgs(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        override
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = _orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[1]; // taker fill amount

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = _targetExchange; // Oasis Dex exchange

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _targetExchange Address of the Melon Engine
    /// @param _orderValues [0] Expected min ETH quantity (maker quantity)
    /// @param _orderValues [1] Expected MLN quantity (taker quantity)
    /// @param _orderValues [6] Same as orderValues[1]
    /// @param _orderAddresses [2] WETH token (maker asset)
    /// @param _orderAddresses [3] MLN token (taker asset)
    function __validateTakeOrderParams(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        override
    {
        require(
            _orderAddresses[2] == __getNativeAssetAddress(),
            "__validateTakeOrderParams: maker asset does not match nativeAsset"
        );
        require(
            _orderAddresses[3] == __getMlnTokenAddress(),
            "__validateTakeOrderParams: taker asset does not match mlnToken"
        );
        require(
            _orderValues[1] == _orderValues[6],
            "__validateTakeOrderParams: fill taker quantity must equal taker quantity"
        );
    }
}
