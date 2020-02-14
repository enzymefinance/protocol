pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./interfaces/ISwap.sol";

contract AirSwapAdapter is ExchangeAdapter {

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

        return (
            [
                orderAddresses[0],
                orderAddresses[2],
                orderAddresses[1],
                orderAddresses[3],
                address(0),
                address(0)
            ],
            [
                orderValues[2],
                orderValues[4],
                orderValues[4]
            ]
        );
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

