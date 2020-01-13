pragma solidity 0.6.1;

import "main/dependencies/DSGuard.sol";
import "main/fund/hub/Spoke.sol";
import "main/version/Registry.sol";

/// @notice Hub used for testing
contract MockHub is DSGuard {

    struct Routes {
        address accounting;
        address feeManager;
        address participation;
        address policyManager;
        address shares;
        address trading;
        address vault;
        address registry;
        address version;
        address engine;
        address mlnAddress;
    }
    Routes public routes;
    address public manager;
    string public name;
    bool public isShutDown;

    function setManager(address _manager) public { manager = _manager; }

    function setName(string memory _name) public { name = _name; }

    function shutDownFund() public { isShutDown = true; }

    function setShutDownState(bool _state) public { isShutDown = _state; }

    function setSpokes(address[11] memory _spokes) public {
        routes.accounting = _spokes[0];
        routes.feeManager = _spokes[1];
        routes.participation = _spokes[2];
        routes.policyManager = _spokes[3];
        routes.shares = _spokes[4];
        routes.trading = _spokes[5];
        routes.vault = _spokes[6];
        routes.registry = _spokes[7];
        routes.version = _spokes[8];
        routes.engine = _spokes[9];
        routes.mlnAddress = _spokes[10];
    }

    function setRouting() public {
        address[11] memory spokes = [
            routes.accounting, routes.feeManager, routes.participation,
            routes.policyManager, routes.shares, routes.trading,
            routes.vault, routes.registry, routes.version,
            routes.engine, routes.mlnAddress
        ];
        Spoke(routes.accounting).initialize(spokes);
        Spoke(routes.feeManager).initialize(spokes);
        Spoke(routes.participation).initialize(spokes);
        Spoke(routes.policyManager).initialize(spokes);
        Spoke(routes.shares).initialize(spokes);
        Spoke(routes.trading).initialize(spokes);
        Spoke(routes.vault).initialize(spokes);
    }

    function setPermissions() public {
        permit(routes.participation, routes.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(routes.trading, routes.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(routes.participation, routes.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(routes.participation, routes.shares, bytes4(keccak256('destroyFor(address,uint256)')));
        permit(routes.feeManager, routes.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(routes.participation, routes.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(routes.participation, routes.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(routes.trading, routes.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(routes.trading, routes.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(routes.accounting, routes.feeManager, bytes4(keccak256('rewardAllFees()')));
        permit(manager, routes.feeManager, bytes4(keccak256('register(address)')));
        permit(manager, routes.feeManager, bytes4(keccak256('batchRegister(address[])')));
        permit(manager, routes.policyManager, bytes4(keccak256('register(bytes4,address)')));
        permit(manager, routes.policyManager, bytes4(keccak256('batchRegister(bytes4[],address[])')));
        permit(manager, routes.participation, bytes4(keccak256('enableInvestment(address[])')));
        permit(manager, routes.participation, bytes4(keccak256('disableInvestment(address[])')));
        permit(bytes32(bytes20(msg.sender)), ANY, ANY);
    }

    function permitSomething(address _from, address _to, bytes4 _sig) public {
        permit(
            bytes32(bytes20(_from)),
            bytes32(bytes20(_to)),
            _sig
        );
    }

    function initializeSpoke(address _spoke) public {
        address[11] memory spokes = [
            routes.accounting, routes.feeManager, routes.participation,
            routes.policyManager, routes.shares, routes.trading,
            routes.vault, routes.registry, routes.version,
            routes.engine, routes.mlnAddress
        ];
        Spoke(_spoke).initialize(spokes);
    }

    function vault() public view returns (address) { return routes.vault; }
    function accounting() public view returns (address) { return routes.accounting; }
    function priceSource() public view returns (address) { return Registry(routes.registry).priceSource(); }
    function participation() public view returns (address) { return routes.participation; }
    function trading() public view returns (address) { return routes.trading; }
    function shares() public view returns (address) { return routes.shares; }
    function policyManager() public view returns (address) { return routes.policyManager; }
    function registry() public view returns (address) { return routes.registry; }
}

