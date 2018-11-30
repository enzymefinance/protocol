pragma solidity ^0.4.21;

import "./Version.i.sol";
import "../factory/FundFactory.sol";
import "../fund/hub/Hub.sol";

/// @notice Controlled by governance
contract Version is FundFactory, DSAuth, VersionInterface {
    uint public amguPrice;
    bool public isShutDown;

    constructor(
        address _governance,
        address _accountingFactory,
        address _feeManagerFactory,
        address _participationFactory,
        address _sharesFactory,
        address _tradingFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _version,
        address _engine,
        address _factoryPriceSource,
        address _mlnAddress
    ) 
        FundFactory(
            _accountingFactory,
            _feeManagerFactory,
            _participationFactory,
            _sharesFactory,
            _tradingFactory,
            _vaultFactory,
            _policyManagerFactory,
            _version,
            _engine,
            _factoryPriceSource,
            _mlnAddress
        )
    {
        setOwner(_governance);
    }

    function setAmguPrice(uint _price) auth {
        amguPrice = _price;
    }

    function shutDown() external auth { isShutDown = true; }

    function shutDownFund(address _hub) external {
        require(
            isShutDown || managersToHubs[msg.sender] == _hub,
            "Conditions not met for fund shutdown"
        );
        Hub(_hub).shutDownFund();
    }

    function getAmguPrice() returns (uint) { return amguPrice; }

    function isFund(address _who) returns (bool) {
        return managersToHubs[_who] != 0;
    }

    function isFundFactory(address _who) returns (bool) {
        return _who == address(this);
    }
}

