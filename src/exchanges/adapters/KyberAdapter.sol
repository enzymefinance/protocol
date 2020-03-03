pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../interfaces/IKyberNetworkProxy.sol";
import "../libs/ExchangeAdapter.sol";
import "../libs/OrderTaker.sol";
import "../../dependencies/WETH.sol";

/// @title KyberAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and Kyber Network
contract KyberAdapter is ExchangeAdapter, OrderTaker {
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
    function extractTakeOrderRiskManagementArgs(
        bytes calldata _encodedArgs
    )
        external
        pure
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

    /// @notice Take a market order on Kyber Swap (takeOrder)
    /// @param _targetExchange Address of the Kyber exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill quantity (same as _orderValues[1])
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
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts,
        ) = __decodeOrderFillData(_fillData);

        // Execute order on exchange, depending on asset types
        if (fillAssets[1] == __getNativeAssetAddress()) {
            __swapNativeAssetToToken(
                _targetExchange,
                fillAssets,
                fillExpectedAmounts
            );
        }
        else if (fillAssets[0] == __getNativeAssetAddress()) {
            __swapTokenToNativeAsset(
                _targetExchange,
                fillAssets,
                fillExpectedAmounts
            );
        }
        else {
            __swapTokenToToken(
                _targetExchange,
                fillAssets,
                fillExpectedAmounts
            );
        }
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _targetExchange Address of the Kyber exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill quantity
    /// @return _fillAssets Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return _fillExpectedAmounts Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// @return _fillApprovalTargets Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] Kyber exchange (_targetExchange)
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
            uint256[2] memory orderValues
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address[] memory fillAssets = new address[](2);
        fillAssets[0] = orderAddresses[0]; // maker asset
        fillAssets[1] = orderAddresses[1]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = orderValues[1]; // taker fill amount

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = fillAssets[1] == __getNativeAssetAddress() ?
            address(0) :
            _targetExchange; // Kyber exchange

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _targetExchange Address of the Kyber exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill quantity
    function __validateTakeOrderParams(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
    {
        require(true);
    }

    // PRIVATE FUNCTIONS

    /// @notice Calculates the minimum acceptable rate of taker asset per maker asset
    /// @dev Required by Kyber swap
    function __calcMinMakerAssetPerTakerAssetRate(
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
        view
        returns (uint256)
    {
        return mul(
            _fillExpectedAmounts[1],
            10 ** uint256(ERC20WithFields(_fillAssets[0]).decimals())
        ) / _fillExpectedAmounts[0];
    }

    /// @notice Executes a swap of ETH (taker) to ERC20 (maker)
    function __swapNativeAssetToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        require(
            __getAccounting().assetBalances(_fillAssets[1]) >= _fillExpectedAmounts[1],
            "__swapNativeAssetToToken: insufficient native token assetBalance"
        );

        // Convert WETH to ETH
        WETH(payable(_fillAssets[1])).withdraw(_fillExpectedAmounts[1]);

        // Swap tokens
        IKyberNetworkProxy(_targetExchange).swapEtherToToken.value(
            _fillExpectedAmounts[1]
        )
        (
            _fillAssets[0],
            __calcMinMakerAssetPerTakerAssetRate(_fillAssets, _fillExpectedAmounts)
        );
    }

    /// @notice Executes a swap of ERC20 (taker) to ETH (maker)
    function __swapTokenToNativeAsset(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        uint256 preEthBalance = payable(address(this)).balance;
        IKyberNetworkProxy(_targetExchange).swapTokenToEther(
            _fillAssets[1],
            _fillExpectedAmounts[1],
            __calcMinMakerAssetPerTakerAssetRate(_fillAssets, _fillExpectedAmounts)
        );
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Convert ETH to WETH
        WETH(payable(_fillAssets[0])).deposit.value(ethFilledAmount)();
    }

    /// @notice Executes a swap of ERC20 (taker) to ERC20 (maker)
    function __swapTokenToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        IKyberNetworkProxy(_targetExchange).swapTokenToToken(
            _fillAssets[1],
            _fillExpectedAmounts[1],
            _fillAssets[0],
            __calcMinMakerAssetPerTakerAssetRate(_fillAssets, _fillExpectedAmounts)
        );
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
