pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "./Version.i.sol";
import "../factory/FundFactory.sol";
import "../fund/hub/Hub.sol";

/// @notice Controlled by governance
contract Version is FundFactory, DSAuth, VersionInterface {
    uint public amguPrice;
    bool public isShutDown;

    /// @notice Assumes governance is the deployer
    constructor(
        address _accountingFactory,
        address _feeManagerFactory,
        address _participationFactory,
        address _sharesFactory,
        address _tradingFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _engine,
        address _factoryPriceSource,
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
            _factoryPriceSource,
            _mlnAddress
        )
    {
        registry = _registry;
    }

    function setAmguPrice(uint _price) auth {
        amguPrice = _price;
        emit SetAmguPrice(_price);
    }

    function getAmguPrice() returns (uint) { return amguPrice; }

    function shutDown() external auth {
        isShutDown = true;
        emit ShutDown();
    }

    function shutDownFund(address _hub) external {
        require(
            isShutDown || managersToHubs[msg.sender] == _hub,
            "Conditions not met for fund shutdown"
        );
        Hub(_hub).shutDownFund();
    }

    function isFund(address _who) returns (bool) {
        if (hubExists[_who]) {
            return true; // directly from a hub
        } else {
            address hub = Hub(Spoke(_who).hub());
            require(
                Hub(hub).isSpoke(_who),
                "Call from either a spoke or hub"
            );
            return hubExists[hub];
        }
    }

    function isFundFactory(address _who) returns (bool) {
        return _who == address(this);
    }
}

