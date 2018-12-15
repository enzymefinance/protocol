pragma solidity ^0.4.21;

import "Engine.sol";
import "Hub.sol";
import "Trading.sol";
import "Vault.sol";
import "math.sol";
import "Weth.sol";
import "ERC20.i.sol";
import "ExchangeAdapter.sol";

/// @notice Trading adapter between Melon and Melon Engine
contract EngineAdapter is DSMath, ExchangeAdapter {

    function () payable {}

    /// @notice Buys Ether from the engine, selling MLN
    /// @param targetExchange Address of the engine
    /// @param orderValues [0] MLN quantity
    /// @param orderAddresses [0] MLN token
    /// @param orderAddresses [1] WETH token
    function takeOrder (
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) onlyManager notShutDown {
        Hub hub = getHub();

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
}
