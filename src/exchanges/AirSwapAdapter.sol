pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./interfaces/ISwap.sol";

contract AirSwapAdapter is ExchangeAdapter {

    function getRiskManagementArgs(
        bytes calldata _encodedArgs
    )
        external
        pure
        override
        returns (address[6] memory, uint[3] memory)
    {
        (
            address[9] memory orderAddresses,
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

    function _decodeArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[9] memory orderAddresses,
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
                address[9],
                uint[8],
                bytes4[3],
                bytes32[2],
                uint8,
                bytes1
            )
        );
    }

    function testTakeOrder(
        bytes memory _encodedArgs
    )
        public
        override
        onlyManager
        notShutDown
    {
        (
            address[9] memory orderAddresses,
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

        address targetExchange = orderAddresses[8];

        withdrawAndApproveAsset(
            order.sender.token,
            targetExchange,
            order.sender.amount,
            "takerAsset"
        );

        ISwap(targetExchange).swap(order);
    }

    function _constructOrder(
        address[9] memory _orderAddresses,
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

