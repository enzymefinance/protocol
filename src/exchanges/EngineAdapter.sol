pragma solidity 0.5.15;

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
        address[6] memory orderAddresses,
        uint256[8] memory orderValues,
        bytes32 identifier,
        bytes memory makerAssetData,
        bytes memory takerAssetData,
        bytes memory signature
    ) public onlyManager notShutDown {
        Hub hub = getHub();

        address wethAddress = orderAddresses[2];
        address mlnAddress = orderAddresses[3];
        uint minEthToReceive = orderValues[0];
        uint mlnQuantity = orderValues[1];

        require(	
            wethAddress == Registry(hub.registry()).nativeAsset(),	
            "maker asset doesnt match nativeAsset on registry"	
        );
        require(	
            orderValues[1] == orderValues[6],	
            "fillTakerQuantity must equal takerAssetQuantity"	
        );

        Vault vault = Vault(hub.vault());
        vault.withdraw(mlnAddress, mlnQuantity);
        require(
            IERC20(mlnAddress).approve(targetExchange, mlnQuantity),
            "MLN could not be approved"
        );

        uint ethToReceive = Engine(targetExchange).ethPayoutForMlnAmount(mlnQuantity);
    
        require(
            ethToReceive >= minEthToReceive,
            "Expected ETH to receive is less than takerQuantity (minEthToReceive)"
        );
        
        Engine(targetExchange).sellAndBurnMln(mlnQuantity);
        WETH(address(uint160(wethAddress))).deposit.value(ethToReceive)();
        safeTransfer(wethAddress, address(vault), ethToReceive);
  
        getAccounting().addAssetToOwnedAssets(wethAddress);
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(0),
            Trading.UpdateType.take,
            [address(uint160(wethAddress)), address(uint160(mlnAddress))],
            [ethToReceive, mlnQuantity, mlnQuantity]
        );
    }
}
