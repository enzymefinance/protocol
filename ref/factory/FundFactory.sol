pragma solidity ^0.4.21;


import "./AccountingFactory.sol";
import "./SharesFactory.sol";
import "./ParticipationFactory.sol";
import "./SharesFactory.sol";
import "./FeeManagerFactory.sol";
import "./TradingFactory.sol";
import "./VaultFactory.sol";
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
contract FundFactory {

    address public defaultPriceSource;
    AccountingFactory public accountingFactory;
    FeeManagerFactory public feeManagerFactory;
    ParticipationFactory public participationFactory;
    // PolicyManagerFactory public policyManagerFactory;
    SharesFactory public sharesFactory;
    TradingFactory public tradingFactory;
    VaultFactory public vaultFactory;

    address[] public funds;
    mapping (address => address) public managersToFunds;
    address[] mockAddresses;
    bool[] mockBools;

    function setupFund(
        // string _name,
        // address _quoteAsset,
        // address _compliance,
        // address[] _policies,
        // address[] _fees,
        address[] _exchanges,
        address[] _defaultAssets
    )
        public
    {
        require(managersToFunds[msg.sender] == address(0));
        Hub hub = new Hub(msg.sender);
        address shares = sharesFactory.createInstance(hub, mockAddresses);
        address vault = vaultFactory.createInstance(hub, mockAddresses);
        address participation = participationFactory.createInstance(hub);
        // address participation = createParticipation(hub);
        address trading = tradingFactory.createInstance(hub, mockAddresses, mockAddresses, mockBools);
        // address policyManager = policyManagerFactory.createInstance(hub, mockAddresses);
        address policyManager = address(0);
        address feeManager = feeManagerFactory.createInstance(hub);
        address accounting = accountingFactory.createInstance(hub, mockAddresses);
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

    // function createParticipation(address _hub) returns (address) {
    //     return participationFactory.createInstance(_hub);
    // }

    // TODO: temporary (testing) setters (remove when done testing)
    function setPriceSource(address _source) public {
        defaultPriceSource = _source;
    }
    function setAccountingFactory(address _factory) public {
        accountingFactory = AccountingFactory(_factory);
    }
    function setSharesFactory(address _factory) public {
        sharesFactory = SharesFactory(_factory);
    }
    // function setPolicyManagerFactory(address _factory) public {
    //     policyManagerFactory = PolicyManagerFactory(_factory);
    // }
    function setFeeManagerFactory(address _factory) public {
        feeManagerFactory = FeeManagerFactory(_factory);
    }
    function setTradingFactory(address _factory) public {
        tradingFactory = TradingFactory(_factory);
    }
    function setVaultFactory(address _factory) public {
        vaultFactory = VaultFactory(_factory);
    }
    function setParticipationFactory(address _factory) public {
        participationFactory = ParticipationFactory(_factory);
    }

    function getFundById(uint withId) public view returns (address) { return funds[withId]; }
    function getLastFundId() public view returns (uint) { return funds.length - 1; }
}

