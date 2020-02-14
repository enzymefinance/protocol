pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./interfaces/ISwap.sol";

contract AirSwapAdapter is ExchangeAdapter {

    /// @notice Extract arguments for risk management validations
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
    function extractRiskManagementArgs(
        bytes calldata _encodedArgs
    )
        external
        pure
        override
        returns (address[6] memory, uint[3] memory)
    {
        (
            address[8] memory orderAddresses,
            uint[8] memory orderValues, , , ,
        ) = _decodeArgs(_encodedArgs);

        address[6] memory rskMngAddrs = [
            orderAddresses[0],
            orderAddresses[2],
            orderAddresses[1],
            orderAddresses[3],
            address(0),
            address(0)
        ];
        uint[3] memory rskMngVals = [
            orderValues[2],
            orderValues[4],
            orderValues[4]
        ];
        return (rskMngAddrs, rskMngVals);
    }

    function swapToken(
        address _targetExchange,
        bytes calldata _encodedArgs
    )
        external
        override
        onlyManager
        notShutDown
    {
        (
            address[8] memory orderAddresses,
            uint[8] memory orderValues,
            bytes4[3] memory tokenKinds,
            bytes32[2] memory sigBytesComponents,
            uint8 sigUintComponent,
            bytes1 version
        ) = _decodeArgs(_encodedArgs);

        ISwap.Order memory order = _constructOrder(
            orderAddresses,
            orderValues,
            tokenKinds,
            sigBytesComponents,
            sigUintComponent,
            version
        );

        withdrawAndApproveAsset(
            order.sender.token,
            _targetExchange,
            order.sender.amount,
            "takerAsset"
        );

        ISwap(_targetExchange).swap(order);
    }

    /// @notice Decoder
    /// @notice Reference ISwap.sol for Order type
    /// @param _encodedArgs Encoded arguments for a specific exchange
    /// @notice orderAddresses [0] order.signer.wallet
    /// @notice orderAddresses [1] order.signer.token
    /// @notice orderAddresses [2] order.sender.wallet
    /// @notice orderAddresses [3] order.sender.token
    /// @notice orderAddresses [4] order.affiliate.wallet
    /// @notice orderAddresses [5] order.affiliate.token
    /// @notice orderAddresses [6] order.signature.signatory
    /// @notice orderAddresses [7] order.signature.validator
    /// @notice orderValues [0] order.nonce
    /// @notice orderValues [1] order.expiry
    /// @notice orderValues [2] order.signer.amount
    /// @notice orderValues [3] order.signer.id
    /// @notice orderValues [4] order.sender.amount
    /// @notice orderValues [5] order.sender.id
    /// @notice orderValues [6] order.affiliate.amount
    /// @notice orderValues [7] order.affiliate.id
    /// @notice tokenKinds [0] order.signer.kind
    /// @notice tokenKinds [1] order.sender.kind
    /// @notice tokenKinds [2] order.affiliate.kind
    /// @notice sigBytesComponents [0] order.signature.r
    /// @notice sigBytesComponents [1] order.signature.s
    /// @notice sigUintComponent order.signature.v
    /// @notice version order.signature.version
    function _decodeArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[8] memory orderAddresses,
            uint[8] memory orderValues,
            bytes4[3] memory tokenKinds,
            bytes32[2] memory sigBytesComponents,
            uint8 sigUintComponent,
            bytes1 version
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address[8],
                uint[8],
                bytes4[3],
                bytes32[2],
                uint8,
                bytes1
            )
        );
    }

    function _constructOrder(
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes4[3] memory _tokenKinds,
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
                kind: _tokenKinds[2],
                wallet: _orderAddresses[4],
                token: _orderAddresses[5],
                amount: _orderValues[6],
                id: _orderValues[7]
            }),
            signature: ISwap.Signature({
                signatory: _orderAddresses[6],
                validator: _orderAddresses[7],
                version: _version,
                v: _sigUintComponent,
                r: _sigBytesComponents[0],
                s: _sigBytesComponents[1]
            })
        });
    }
}

