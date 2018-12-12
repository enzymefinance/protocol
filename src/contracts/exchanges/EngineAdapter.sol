pragma solidity ^0.4.21;

import "Engine.sol";
import "Hub.sol";
import "Trading.sol";
import "Vault.sol";
import "math.sol";
import "Weth.sol";
import "ERC20.i.sol";
import "ExchangeAdapterInterface.sol";

/// @notice Trading adapter between Melon and Melon Engine
contract EngineAdapter is DSMath, ExchangeAdapterInterface {

    /// @notice Buys Ether from the engine, selling MLN
    /// @param targetExchange Address of the engine
    /// @param orderValues [0] MLN quantity
    /// @param orderAddresses [0] MLN token
    /// @param orderAddresses [1] WETH token
    function takeOrder (
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

    /// @dev Dummy function; not implemented on exchange
    function makeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        revert("Unimplemented");
    }

    /// @dev Dummy function; not implemented on exchange
    function cancelOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    )
    {
        revert("Unimplemented");
    }

    // VIEW FUNCTIONS

    /// @dev Dummy function; not implemented on exchange
    function getOrder(
        address targetExchange,
        uint id,
        address makerAsset
    )
        view
        returns (address, address, uint, uint)
    {
        revert("Unimplemented");
    }
}
