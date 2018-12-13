pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "Version.i.sol";
import "FundFactory.sol";
import "Hub.sol";

/// @notice Controlled by governance
contract Version is FundFactory, DSAuth, VersionInterface {
    bool public isShutDown;

    /// @dev Assumes governance is the deployer
    constructor(
        address _accountingFactory,
        address _feeManagerFactory,
        address _participationFactory,
        address _sharesFactory,
        address _tradingFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _engine,
        address _priceSource,
        address _mlnAddress,
        address _registry
    )
        FundFactory(
            _accountingFactory,
            _feeManagerFactory,
            _participationFactory,
            _sharesFactory,
            _tradingFactory,
            _vaultFactory,
            _policyManagerFactory,
            address(this),
            _engine,
            _priceSource,
            _mlnAddress
        )
    {
        registry = _registry;
        require(_mlnAddress == Registry(registry).mlnToken(), "Wrong MLN token passed");
        require(_priceSource == Registry(registry).priceSource(), "Wrong price source passed");
    }

    function securityShutDown() external auth {
        isShutDown = true;
        emit ShutDownVersion();
    }

    function shutDownFund(address _hub) external {
        require(
            managersToHubs[msg.sender] == _hub,
            "Conditions not met for fund shutdown"
        );
        Hub(_hub).shutDownFund();
    }

    function getShutDownStatus() external returns (bool) { return isShutDown; }
}

