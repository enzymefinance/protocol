// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../interfaces/ISwap.sol";
import "../libs/OrderTaker.sol";

/// @title AirSwapAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter between Melon and AirSwap
contract AirSwapAdapter is OrderTaker {
    address immutable public EXCHANGE;

    constructor(address _exchange) public {
        EXCHANGE = _exchange;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external pure override returns (string memory) {
        return "AIRSWAP";
    }

    /// @notice Parses the expected assets to receive from a call on integration 
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedArgs The encoded parameters for the callOnIntegration
    /// @return incomingAssets_ The assets to receive
    function parseIncomingAssets(bytes4 _selector, bytes calldata _encodedArgs)
        external
        view
        override
        returns (address[] memory incomingAssets_)
    {
        if (_selector == TAKE_ORDER_SELECTOR) {
            (address[6] memory orderAddresses,,,,,) = __decodeTakeOrderArgs(_encodedArgs);
            incomingAssets_ = new address[](1);
            incomingAssets_[0] = orderAddresses[1];
        }
        else {
            revert("parseIncomingAssets: _selector invalid");
        }
    }

    /// @notice Take a market order on AirSwap (takeOrder)
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @param _fillData Encoded data to pass to OrderFiller
    function __fillTakeOrder(bytes memory _encodedArgs, bytes memory _fillData)
        internal
        override
        validateAndFinalizeFilledOrder(_fillData)
    {
        (
            address[6] memory orderAddresses,
            uint256[6] memory orderValues,
            bytes4[2] memory tokenKinds,
            bytes32[2] memory sigBytesComponents,
            uint8 sigUintComponent,
            bytes1 version
        ) = __decodeTakeOrderArgs(_encodedArgs);

        ISwap.Order memory order = __constructTakerOrder(
            orderAddresses,
            orderValues,
            tokenKinds,
            sigBytesComponents,
            sigUintComponent,
            version
        );

        ISwap(EXCHANGE).swap(order);
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return fillAssets_ Assets to fill
    /// - [0] Maker asset
    /// - [1] Taker asset
    /// @return fillExpectedAmounts_ Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// @return fillApprovalTargets_ Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] AirSwap exchange of taker asset
    function __formatFillTakeOrderArgs(bytes memory _encodedArgs)
        internal
        view
        override
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        (
            address[6] memory orderAddresses,
            uint256[6] memory orderValues, , , ,
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address[] memory fillAssets = new address[](2);
        fillAssets[0] = orderAddresses[1]; // maker asset
        fillAssets[1] = orderAddresses[3]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = orderValues[2]; // maker fill amount
        fillExpectedAmounts[1] = orderValues[4]; // taker fill amount

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = EXCHANGE;

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    function __validateTakeOrderParams(bytes memory _encodedArgs)
        internal
        view
        override
    {}

    // PRIVATE FUNCTIONS

    /// @notice Parses user inputs into a ISwap.Order format
    function __constructTakerOrder(
        address[6] memory _orderAddresses,
        uint256[6] memory _orderValues,
        bytes4[2] memory _tokenKinds,
        bytes32[2] memory _sigBytesComponents,
        uint8 _sigUintComponent,
        bytes1 _version
    )
        private
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

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return orderAddresses_
    /// - [0] order.signer.wallet
    /// - [1] order.signer.token
    /// - [2] order.sender.wallet
    /// - [3] order.sender.token
    /// - [4] order.signature.signatory
    /// - [5] order.signature.validator
    /// @return orderValues_
    /// - [0] order.nonce
    /// - [1] order.expiry
    /// - [2] order.signer.amount
    /// - [3] order.signer.id
    /// - [4] order.sender.amount
    /// - [5] order.sender.id
    /// @return tokenKinds_
    /// - [0] order.signer.kind
    /// - [1] order.sender.kind
    /// @return sigBytesComponents_
    /// - [0] order.signature.r
    /// - [1] order.signature.s
    /// @return sigUintComponent_ order.signature.v
    /// @return version_ order.signature.version
    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[6] memory orderAddresses_,
            uint256[6] memory orderValues_,
            bytes4[2] memory tokenKinds_,
            bytes32[2] memory sigBytesComponents_,
            uint8 sigUintComponent_,
            bytes1 version_
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
}
