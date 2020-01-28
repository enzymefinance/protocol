pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../engine/Engine.sol";
import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";
import "../dependencies/DSMath.sol";
import "../dependencies/WETH.sol";
import "../dependencies/token/IERC20.sol";
import "./ExchangeAdapter.sol";
import "../dependencies/TokenUser.sol";

/// @notice Trading adapter to Melon Engine
contract EngineAdapter is DSMath, TokenUser, ExchangeAdapter {

    /// @notice Buys Ether from the engine, selling MLN
    /// @param targetExchange Address of the engine
    /// @param orderValues [0] Min Eth to receive from the engine
    /// @param orderValues [1] MLN quantity
    /// @param orderValues [6] Same as orderValues[1]
    /// @param orderAddresses [2] WETH token
    /// @param orderAddresses [3] MLN token
    function takeOrder (
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override onlyManager notShutDown {
        Hub hub = getHub();

        address wethAddress = orderAddresses[2];
        address mlnAddress = orderAddresses[3];
        uint minEthToReceive = orderValues[0];
        uint mlnQuantity = orderValues[1];

        require(
            wethAddress == Registry(hub.registry()).nativeAsset(),
            "maker asset does not match nativeAsset on registry"
        );
        require(
            orderValues[1] == orderValues[6],
            "fillTakerQuantity must equal takerAssetQuantity"
        );

        withdrawAndApproveAsset(mlnAddress, targetExchange, mlnQuantity, "takerAsset");

        uint ethToReceive = Engine(payable(targetExchange)).ethPayoutForMlnAmount(mlnQuantity);

        require(
            ethToReceive >= minEthToReceive,
            "Expected ETH to receive is less than takerQuantity (minEthToReceive)"
        );

        Engine(payable(targetExchange)).sellAndBurnMln(mlnQuantity);
        WETH(payable(wethAddress)).deposit.value(ethToReceive)();
        safeTransfer(wethAddress, address(Vault(hub.vault())), ethToReceive);

        getAccounting().addAssetToOwnedAssets(wethAddress);
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(0),
            Trading.UpdateType.take,
            [payable(wethAddress), payable(mlnAddress)],
            [ethToReceive, mlnQuantity, mlnQuantity]
        );
    }

    /// @notice Buys Ether from the engine, selling MLN
    /// @param targetExchange Address of the engine
    /// @param orderValues [0] Min ETH to receive from the engine
    /// @param orderValues [1] MLN quantity to send to engine
    /// @param orderValues [6] Same as orderValues[1]
    /// @param orderAddresses [2] WETH token
    /// @param orderAddresses [3] MLN token
    /// @param orderAddresses [6] Participation contract
    /// @param orderAddresses [7] Request owner
    function executeRequestAndBurnMln(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public onlyManager notShutDown {
        Hub hub = getHub();
        address wethAddress = orderAddresses[2];
        address mlnAddress = orderAddresses[3];
        uint minEthToReceive = orderValues[0];
        uint mlnQuantity = orderValues[1];

        require(
            wethAddress == Registry(hub.registry()).nativeAsset(),
            "maker asset does not match nativeAsset on registry"
        );
        require(
            orderValues[1] == orderValues[6],
            "fillTakerQuantity must equal takerAssetQuantity"
        );

        // TODO: fix incentive issue (getting it dynamically may lead to unexpected results)
        uint256 incentiveAmount = Registry(hub.registry()).incentive();
        require(
            incentiveAmount >= minEthToReceive,
            "Not enough incentive will be transferred"
        );
        require(
            mlnQuantity ==
            Engine(targetExchange).mlnRequiredForIncentiveAmount(incentiveAmount),
            "MLN needed to pay for ETH incentive is higher than expected"
        );
        approveAsset(mlnAddress, targetExchange, mlnQuantity, "takerAsset");
        uint256 preEthBalance = address(getTrading()).balance;
        Engine(payable(targetExchange)).executeRequestAndBurnMln(orderAddresses[6], orderAddresses[7]);
        uint256 ethReceived = sub(address(getTrading()).balance, preEthBalance);
        require(
            ethReceived == incentiveAmount,
            "Received incentive was different than expected"
        );
        WETH(payable(wethAddress)).deposit.value(ethReceived)();
        safeTransfer(wethAddress, address(Vault(hub.vault())), ethReceived);

        getAccounting().addAssetToOwnedAssets(wethAddress);
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(0),
            Trading.UpdateType.take,
            [payable(wethAddress), payable(mlnAddress)],
            [ethReceived, mlnQuantity, mlnQuantity]
        );
    }
}
