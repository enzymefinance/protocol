pragma solidity ^0.4.21;


import "../fund/accounting/Accounting.sol";
import "../fund/fees/FeeManager.sol";
import "../fund/hub/Hub.sol";
import "../fund/participation/Participation.sol";
import "../fund/shares/Shares.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";
import "../../../src/policies/Manager.sol";

// TODO: integrate with existing infrastructure (version, governance, etc.)
/// @notice Creates fund components and links them together
contract Factory {

    address public defaultPriceSource;

    address[] public funds;
    mapping (address => address) public managersToFunds;

    function setupFund(
        string _name,
        address _quoteAsset,
        address _compliance,
        address[] _policies,
        address[] _fees,
        address[] _exchanges,
        address[] _defaultAssets
    ) {
        require(managersToFunds[msg.sender] == address(0));
        address hub = new Hub(msg.sender);
        address shares = new Shares(hub);
        address vault = new Vault(hub);
        address participation = new Participation(hub);
        address trading = new Trading(hub);
        address policyManager = new PolicyManager(hub);
        address feeManager = new FeeManager(hub);
        address accounting = new Accounting(hub);
        address priceSource = defaultPriceSource;
        address canonicalRegistrar = defaultPriceSource;
        address version = address(0);
        hub.setComponents(
            shares,
            vault,
            participation,
            trading,
            policyManager,
            feeManager,
            accounting,
            priceSource,
            canonicalRegistrar,
            version
        );
        funds.push(hub);
        managersToFunds[msg.sender] = hub;
    }

    // TODO: temporary (testing) setter
    function setPriceSource(address _source) {
        defaultPriceSource = _source;
    }

    function getFundById(uint withId) view returns (address) { return funds[withId]; }
    function getLastFundId() view returns (uint) { return funds.length - 1; }
}

