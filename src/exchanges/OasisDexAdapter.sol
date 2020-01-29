pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/DSMath.sol";
import "./interfaces/IOasisDex.sol";
import "./ExchangeAdapter.sol";

/// @title OasisDexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract OasisDexAdapter is DSMath, ExchangeAdapter {

    event OrderCreated(uint256 id);

    //  METHODS

    //  PUBLIC METHODS

    // Responsibilities of takeOrder are:
    // - check sender
    // - check fund not shut down
    // - check not buying own fund tokens
    // - check price exists for asset pair
    // - check price is recent
    // - check price passes risk management
    // - approve funds to be traded (if necessary)
    // - take order from the exchange
    // - check order was taken (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Takes an active order on the selected exchange
    /// @dev These orders are expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderValues [6] Fill amount : amount of taker token to fill
    /// @param identifier Active order id
    function takeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override onlyManager notShutDown {
        Hub hub = getHub();
        uint256 fillTakerQuantity = orderValues[6];
        uint256 maxMakerQuantity;
        address makerAsset;
        uint256 maxTakerQuantity;
        address takerAsset;
        (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = IOasisDex(targetExchange).getOffer(uint256(identifier));
        uint256 fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        require(
            makerAsset == orderAddresses[2] && takerAsset == orderAddresses[3],
            "Maker and taker assets do not match the order addresses"
        );
        require(
            makerAsset != takerAsset,
            "Maker and taker assets cannot be the same"
        );
        require(fillMakerQuantity <= maxMakerQuantity, "Maker amount to fill above max");
        require(fillTakerQuantity <= maxTakerQuantity, "Taker amount to fill above max");

        withdrawAndApproveAsset(takerAsset, targetExchange, fillTakerQuantity, "takerAsset");

        require(
            IOasisDex(targetExchange).buy(uint256(identifier), fillMakerQuantity),
            "Buy on matching market failed"
        );

        getAccounting().decreaseAssetBalance(takerAsset, fillTakerQuantity);
        getAccounting().increaseAssetBalance(makerAsset, fillMakerQuantity);

        getTrading().returnAssetToVault(makerAsset);
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.take,
            [payable(makerAsset), payable(takerAsset)],
            [maxMakerQuantity, maxTakerQuantity, fillTakerQuantity]
        );
    }
}
