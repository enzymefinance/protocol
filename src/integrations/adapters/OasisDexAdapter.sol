// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../interfaces/IOasisDex.sol";
import "../libs/OrderTaker.sol";

/// @title OasisDexAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter between Melon and OasisDex Matching Market
contract OasisDexAdapter is OrderTaker {
    address immutable public EXCHANGE;

    constructor(address _exchange) public {
        EXCHANGE = _exchange;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external pure override returns (string memory) {
        return "OASIS_DEX";
    }

    /// @notice Extract arguments for risk management validations of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return riskManagementAddresses_ needed addresses for risk management
    /// - [0] Maker address
    /// - [1] Taker address
    /// - [2] Maker asset
    /// - [3] Taker asset
    /// - [4] Maker fee asset
    /// - [5] Taker fee asset
    /// @return riskManagementValues_ needed values for risk management
    /// - [0] Maker asset amount
    /// - [1] Taker asset amount
    /// - [2] Taker asset fill amount
    function __extractTakeOrderRiskManagementArgs(bytes memory _encodedArgs)
        internal
        view
        override
        returns (address[6] memory riskManagementAddresses_, uint256[3] memory riskManagementValues_)
    {
        (
            address makerAsset,
            uint256 makerQuantity,
            address takerAsset,
            uint256 takerQuantity
            ,
        ) = __decodeTakeOrderArgs(_encodedArgs);

        riskManagementAddresses_ = [
            address(0),
            address(this),
            makerAsset,
            takerAsset,
            address(0),
            address(0)
        ];
        riskManagementValues_ = [
            makerQuantity,
            takerQuantity,
            takerQuantity
        ];
    }

    /// @notice Takes an active order on Oasis Dex (takeOrder)
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @param _fillData Encoded data to pass to OrderFiller
    function __fillTakeOrder(bytes memory _encodedArgs, bytes memory _fillData)
        internal
        override
        validateAndFinalizeFilledOrder(_fillData)
    {
        (
            , , , ,
            uint256 identifier
        ) = __decodeTakeOrderArgs(_encodedArgs);

        (,uint256[] memory fillExpectedAmounts,) = __decodeOrderFillData(_fillData);

        // Execute take order on exchange
        IOasisDex(EXCHANGE).buy(uint256(identifier), fillExpectedAmounts[0]);
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return fillAssets_ Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return fillExpectedAmounts_ Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// @return fillApprovalTargets_ Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] Oasis Dex exchange ()
    function __formatFillTakeOrderArgs(bytes memory _encodedArgs)
        internal
        view
        override
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        (
            address makerAsset,
            ,
            address takerAsset,
            uint256 takerQuantity,
            uint256 identifier
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address[] memory fillAssets = new address[](2);
        fillAssets[0] = makerAsset;
        fillAssets[1] = takerAsset;

        (
            uint256 maxMakerQuantity,,uint256 maxTakerQuantity,
        ) = IOasisDex(EXCHANGE).getOffer(uint256(identifier));

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = __calculateRelativeQuantity(
            maxTakerQuantity,
            maxMakerQuantity,
            takerQuantity
        ); // maker fill amount
        fillExpectedAmounts[1] = takerQuantity; // taker fill amount

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = EXCHANGE; // Oasis Dex exchange

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    function __validateTakeOrderParams(bytes memory _encodedArgs)
        internal
        view
        override
    {
        (
            address decodedMakerAsset,
            ,
            address decodedTakerAsset,
            uint256 takerQuantity,
            uint256 identifier
        ) = __decodeTakeOrderArgs(_encodedArgs);
        (
            ,
            address makerAsset,
            uint256 maxTakerQuantity,
            address takerAsset
        ) = IOasisDex(EXCHANGE).getOffer(uint256(identifier));

        require(
            decodedMakerAsset == makerAsset,
            "__validateTakeOrderParams: Order maker asset does not match the input"
        );
        require(
            decodedTakerAsset == takerAsset,
            "__validateTakeOrderParams: Order taker asset does not match the input"
        );

        IRegistry registry = __getRegistry();
        require(registry.assetIsRegistered(
            makerAsset), 'Maker asset not registered'
        );
        require(registry.assetIsRegistered(
            takerAsset), 'Taker asset not registered'
        );

        require(
            takerQuantity <= maxTakerQuantity,
            "__validateTakeOrderParams: Taker fill amount greater than available quantity"
        );
    }

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address makerAsset_,
            uint256 makerQuantity_,
            address takerAsset_,
            uint256 takerQuantity_,
            uint256 identifier_
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address,
                uint256,
                address,
                uint256,
                uint256
            )
        );
    }
}
