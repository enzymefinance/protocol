// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../interfaces/ISwap.sol";
import "../utils/AdapterBase.sol";

/// @title AirSwapAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter between Melon and AirSwap
contract AirSwapAdapter is AdapterBase {
    address immutable public EXCHANGE;

    constructor(address _registry, address _exchange) public AdapterBase(_registry) {
        EXCHANGE = _exchange;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external pure override returns (string memory) {
        return "AIRSWAP";
    }

    /// @notice Take order on AirSwap
    /// @param _encodedArgs Encoded order parameters
    function takeOrder(bytes calldata _encodedArgs)
        external
        onlyVault
        fundAssetsTransferHandler(_encodedArgs)
    {
        // Validate args
        // TODO: is there any validation necessary here?

        // Execute fill
        bytes memory encodedAirSwapOrderArgs = __decodeTakeOrderArgs(_encodedArgs);
        ISwap.Order memory order = __constructOrderStruct(encodedAirSwapOrderArgs);
        IERC20(order.sender.token).approve(EXCHANGE, order.sender.amount);
        ISwap(EXCHANGE).swap(order);
    }

    // PUBLIC FUNCTIONS

    /// @notice Parses the expected assets to receive from a call on integration 
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedArgs The encoded parameters for the callOnIntegration
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes memory _encodedArgs)
        public
        view
        override
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == TAKE_ORDER_SELECTOR) {
            bytes memory encodedAirSwapOrderArgs = __decodeTakeOrderArgs(_encodedArgs);
            ISwap.Order memory order = __constructOrderStruct(encodedAirSwapOrderArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = order.sender.token;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = order.sender.amount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = order.signer.token;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = order.signer.amount;
        }
        else {
            revert("parseIncomingAssets: _selector invalid");
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to contract an ISwap.Order struct from order args
    function __constructOrderStruct(bytes memory _encodedOrderArgs)
        private
        pure
        returns (ISwap.Order memory)
    {
        (
            address[6] memory orderAddresses,
            uint256[6] memory orderValues,
            bytes4[2] memory tokenKinds,
            bytes32[2] memory sigBytesComponents,
            uint8 sigUintComponent,
            bytes1 version
        ) = __decodeAirSwapOrderArgs(_encodedOrderArgs);

        return ISwap.Order({
            nonce: orderValues[0],
            expiry: orderValues[1],
            signer: ISwap.Party({
                kind: tokenKinds[0],
                wallet: orderAddresses[0],
                token: orderAddresses[1],
                amount: orderValues[2],
                id: orderValues[3]
            }),
            sender: ISwap.Party({
                kind: tokenKinds[1],
                wallet: orderAddresses[2],
                token: orderAddresses[3],
                amount: orderValues[4],
                id: orderValues[5]
            }),
            affiliate: ISwap.Party({
                kind: bytes4(0),
                wallet: address(0),
                token: address(0),
                amount: 0,
                id: 0
            }),
            signature: ISwap.Signature({
                signatory: orderAddresses[4],
                validator: orderAddresses[5],
                version: version,
                v: sigUintComponent,
                r: sigBytesComponents[0],
                s: sigBytesComponents[1]
            })
        });
    }

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return encodedAirSwapOrderArgs_ Encoded args of the AirSwap order
    /// @dev Double encoding the order args like this is superfluous, but it is consistent
    /// with the way we pass in 0x order parameters separate from an order fill amount
    // TODO: confirm if partial fills are allowed
    function __decodeTakeOrderArgs(bytes memory _encodedArgs)
        private
        pure
        returns (bytes memory encodedAirSwapOrderArgs_)
    {
        return abi.decode(
            _encodedArgs,
            (bytes)
        );
    }

    /// @dev Decode the parameters of an AirSwap order
    /// @param _encodedAirSwapOrderArgs Encoded parameters of the AirSwap order
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
    function __decodeAirSwapOrderArgs(bytes memory _encodedAirSwapOrderArgs)
        private
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
            _encodedAirSwapOrderArgs,
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
