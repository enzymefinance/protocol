pragma solidity 0.6.4;

import "../../dependencies/DSGuard.sol";
import "../../registry/IRegistry.sol";
import "./Spoke.sol";
import "./IHub.sol";

/// @notice Router for communication between components
/// @notice Has one or more Spokes
contract Hub is IHub, DSGuard {

    event FundShutDown();

    IHub.Routes public routes;
    address public override manager;
    address public creator;
    string public name;
    bool public override isShutDown;
    bool public override fundInitialized;
    uint public creationTime;
    mapping (address => bool) public override isSpoke;

    modifier onlyCreator() {
        require(msg.sender == creator, "Only creator can do this");
        _;
    }

    constructor(address _manager, string memory _name) public {
        creator = msg.sender;
        manager = _manager;
        name = _name;
        creationTime = block.timestamp;
    }

    function shutDownFund() external {
        require(msg.sender == routes.fundFactory);
        isShutDown = true;
        emit FundShutDown();
    }

    function initializeAndSetPermissions(address[6] calldata _spokes) external onlyCreator {
        require(!fundInitialized, "Fund is already initialized");
        for (uint i = 0; i < _spokes.length; i++) {
            isSpoke[_spokes[i]] = true;
        }
        routes.feeManager = _spokes[0];
        routes.policyManager = _spokes[1];
        routes.shares = _spokes[2];
        routes.vault = _spokes[3];
        routes.registry = _spokes[4];
        routes.fundFactory = _spokes[5];

        Spoke(routes.feeManager).initialize(_spokes);
        Spoke(routes.policyManager).initialize(_spokes);
        Spoke(routes.shares).initialize(_spokes);
        Spoke(routes.vault).initialize(_spokes);

        permit(manager, routes.shares, bytes4(keccak256('disableSharesInvestmentAssets(address[])')));
        permit(manager, routes.shares, bytes4(keccak256('enableSharesInvestmentAssets(address[])')));
        permit(
            manager,
            routes.policyManager,
            bytes4(keccak256('batchRegister(bytes4[],address[])'))
        );
        permit(manager, routes.policyManager, bytes4(keccak256('register(bytes4,address)')));
        permit(manager, routes.vault, bytes4(keccak256('addExchange(address,address)')));
        permit(routes.feeManager, routes.shares, bytes4(keccak256('createFor(address,uint256)')));
        fundInitialized = true;
    }

    function getName() external view override returns (string memory) { return name; }
    function priceSource() external view override returns (address) {
        return IRegistry(routes.registry).priceSource();
    }
    function vault() external view override returns (address) { return routes.vault; }
    function shares() external view override returns (address) { return routes.shares; }
    function registry() external view returns (address) { return routes.registry; }
    function fundFactory() external view returns (address) { return routes.fundFactory; }
    function policyManager() external view override returns (address) { return routes.policyManager; }
    function feeManager() external view override returns (address) { return routes.feeManager; }
}
