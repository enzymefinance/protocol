pragma solidity ^0.4.4;

import "../Core.sol";
import "../dependencies/Owned.sol";

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is Owned {

    // FILEDS

    address public addrMeta;
    address[] public portfolios;

    // EVENTS

    event PortfolioCreated(address _fundAddress, uint indexed _id);

    // MODIFIERS

    // CONSTANT METHODS

    function numPortfolios() constant returns (uint) { return portfolios.length; }

    // NON-CONSTANT METHODS
    function Version(address ofMeta) { addrMeta = ofMeta; }

    function createPortfolio(
        address ofRegistrar,
        address ofTrading,
        address ofManagmentFee,
        address ofPerformanceFee
    )
        returns (address)
    {
        // Create new Portfolio
        address createAddr = address(new Core(
            ofRegistrar,
            ofTrading,
            ofManagmentFee,
            ofPerformanceFee
        ));

        // Change owner to msg.sender

        // Registrar Portfolio
        portfolios.push(createAddr);
        PortfolioCreated(createAddr, portfolios.length);
        return createAddr;
    }

    // Dereference Portfolio and trigger selfdestruct
    function annihilatePortfolio() returns (address) {}
}
