pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../libs/ExchangeAdapter.sol";
import "../interfaces/ISwap.sol";
import "../libs/OrderFiller.sol";
import "../../fund/policies/TradingSignatures.sol";

contract AirSwapAdapter is ExchangeAdapter, OrderFiller, TradingSignatures {

    // EXTERNAL FUNCTIONS

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

        if (_methodSelector == SWAP_TOKEN) {
            (
                address[6] memory orderAddresses,
                uint256[6] memory orderValues, , , ,
            ) = __decodeTakeOrderArgs(_encodedArgs);

            rskMngAddrs = [
                orderAddresses[0],
                orderAddresses[2],
                orderAddresses[1],
                orderAddresses[3],
                address(0),
                address(0)
            ];
            rskMngVals = [
                orderValues[2],
                orderValues[4],
                orderValues[4]
            ];
        }
        else {
            revert("methodSelector doesn't exist");
        }

        return (rskMngAddrs, rskMngVals);
    }

    function swapToken(
        address _targetExchange,
        bytes calldata _encodedArgs
    )
        external
        override
    {
        (
            address[6] memory orderAddresses,
            uint256[6] memory orderValues,
            bytes4[2] memory tokenKinds,
            bytes32[2] memory sigBytesComponents,
            uint8 sigUintComponent,
            bytes1 version
        ) = __decodeTakeOrderArgs(_encodedArgs);
        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = __formatFillTakeOrderArgs(orderAddresses, orderValues);

        ISwap.Order memory order = __constructTakerOrder(
            orderAddresses,
            orderValues,
            tokenKinds,
            sigBytesComponents,
            sigUintComponent,
            version
        );

        __fillTakeOrder(_targetExchange, fillAssets, fillExpectedAmounts, order);
    }

    // INTERNAL FUNCTIONS

    function __fillTakeOrder(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts,
        ISwap.Order memory _order
    )
        internal
        validateAndFinalizeFilledOrder(
            _targetExchange,
            _fillAssets,
            _fillExpectedAmounts
        )
    {
        __approveAsset(
            _order.sender.token,
            _targetExchange,
            _order.sender.amount,
            "takerAsset"
        );

        ISwap(_targetExchange).swap(_order);
    }

    function __formatFillTakeOrderArgs(
        address[6] memory _orderAddresses,
        uint256[6] memory _orderValues
    )
        internal
        pure
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[1]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = _orderValues[2]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[4]; // taker fill amount

        return (fillAssets, fillExpectedAmounts);
    }

    /// @notice Decoder
    /// @notice Reference ISwap.sol for Order type
    /// @param _encodedArgs Encoded arguments for a specific exchange
    /// @notice orderAddresses [0] order.signer.wallet
    /// @notice orderAddresses [1] order.signer.token
    /// @notice orderAddresses [2] order.sender.wallet
    /// @notice orderAddresses [3] order.sender.token
    /// @notice orderAddresses [4] order.signature.signatory
    /// @notice orderAddresses [5] order.signature.validator
    /// @notice orderValues [0] order.nonce
    /// @notice orderValues [1] order.expiry
    /// @notice orderValues [2] order.signer.amount
    /// @notice orderValues [3] order.signer.id
    /// @notice orderValues [4] order.sender.amount
    /// @notice orderValues [5] order.sender.id
    /// @notice tokenKinds [0] order.signer.kind
    /// @notice tokenKinds [1] order.sender.kind
    /// @notice sigBytesComponents [0] order.signature.r
    /// @notice sigBytesComponents [1] order.signature.s
    /// @notice sigUintComponent order.signature.v
    /// @notice version order.signature.version
    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[6] memory orderAddresses,
            uint256[6] memory orderValues,
            bytes4[2] memory tokenKinds,
            bytes32[2] memory sigBytesComponents,
            uint8 sigUintComponent,
            bytes1 version
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address[6],
                uint256[6],
                bytes4[2],
                bytes32[2],
                uint8,
                bytes1
            )
        );
    }

    function __constructTakerOrder(
        address[6] memory _orderAddresses,
        uint256[6] memory _orderValues,
        bytes4[2] memory _tokenKinds,
        bytes32[2] memory _sigBytesComponents,
        uint8 _sigUintComponent,
        bytes1 _version
    )
        internal
        pure
        returns (ISwap.Order memory)
    {
        return ISwap.Order({
            nonce: _orderValues[0],
            expiry: _orderValues[1],
            signer: ISwap.Party({
                kind: _tokenKinds[0],
                wallet: _orderAddresses[0],
                token: _orderAddresses[1],
                amount: _orderValues[2],
                id: _orderValues[3]
            }),
            sender: ISwap.Party({
                kind: _tokenKinds[1],
                wallet: _orderAddresses[2],
                token: _orderAddresses[3],
                amount: _orderValues[4],
                id: _orderValues[5]
            }),
            affiliate: ISwap.Party({
                kind: bytes4(0),
                wallet: address(0),
                token: address(0),
                amount: 0,
                id: 0
            }),
            signature: ISwap.Signature({
                signatory: _orderAddresses[4],
                validator: _orderAddresses[5],
                version: _version,
                v: _sigUintComponent,
                r: _sigBytesComponents[0],
                s: _sigBytesComponents[1]
            })
        });
    }
}

