pragma solidity ^0.4.21;

import "../engine/Engine.sol";
import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";
import "../dependencies/math.sol";
import "../dependencies/Weth.sol";
import "../dependencies/token/ERC20.i.sol";

/// @notice Trading adapter between Melon and Melon Engine
contract EngineAdapter is DSMath {

    /// @notice Buys Ether from the engine, selling MLN
    /// @param targetExchange Address of the engine
    /// @param orderValues [0] MLN quantity
    /// @param orderAddresses [0] MLN token
    /// @param orderAddresses [1] WETH token
    function sellMlnBuyEth (
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender, "Manager is not sender");
        require(!hub.isShutDown(), "Hub is shut down");

        address mlnAddress = orderAddresses[0];
        address wethAddress = orderAddresses[1];
        uint mlnQuantity = orderValues[0];

        Vault vault = Vault(hub.vault());
        vault.withdraw(mlnAddress, mlnQuantity);
        require(
            ERC20(mlnAddress).approve(targetExchange, mlnQuantity),
            "MLN could not be approved"
        );

        uint ethToReceive = Engine(targetExchange).ethPayoutForMlnAmount(mlnQuantity);
        Engine(targetExchange).sellAndBurnMln(mlnQuantity);
        WETH(wethAddress).deposit.value(ethToReceive)();
        WETH(wethAddress).transfer(address(vault), ethToReceive);
    }

    function () payable {}
}
