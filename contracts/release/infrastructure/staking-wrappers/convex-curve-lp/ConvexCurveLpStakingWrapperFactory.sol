// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../persistent/dispatcher/IDispatcher.sol";
import "../../../../utils/0.6.12/beacon-proxy/BeaconProxyFactory.sol";
import "./ConvexCurveLpStakingWrapperLib.sol";

/// @title ConvexCurveLpStakingWrapperFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract factory for ConvexCurveLpStakingWrapper instances
contract ConvexCurveLpStakingWrapperFactory is BeaconProxyFactory {
    event WrapperDeployed(uint256 indexed pid, address wrapperProxy, address curveLpToken);

    IDispatcher private immutable DISPATCHER_CONTRACT;

    mapping(uint256 => address) private pidToWrapper;
    // Handy cache for interacting contracts
    mapping(address => address) private wrapperToCurveLpToken;

    modifier onlyOwner() {
        require(msg.sender == getOwner(), "Only the owner can call this function");
        _;
    }

    constructor(address _dispatcher, address _convexBooster, address _crvToken, address _cvxToken)
        public
        BeaconProxyFactory(address(0))
    {
        DISPATCHER_CONTRACT = IDispatcher(_dispatcher);

        __setCanonicalLib(
            address(
                new ConvexCurveLpStakingWrapperLib(
                    address(this),
                    _convexBooster,
                    _crvToken,
                    _cvxToken
                )
            )
        );
    }

    /// @notice Deploys a staking wrapper for a given Convex pool
    /// @param _pid The Convex Curve pool id
    /// @return wrapperProxy_ The staking wrapper proxy contract address
    function deploy(uint256 _pid) external returns (address wrapperProxy_) {
        require(getWrapperForConvexPool(_pid) == address(0), "deploy: Wrapper already exists");

        bytes memory constructData = abi.encodeWithSelector(ConvexCurveLpStakingWrapperLib.init.selector, _pid);

        wrapperProxy_ = deployProxy(constructData);

        pidToWrapper[_pid] = wrapperProxy_;

        address lpToken = ConvexCurveLpStakingWrapperLib(wrapperProxy_).getCurveLpToken();
        wrapperToCurveLpToken[wrapperProxy_] = lpToken;

        emit WrapperDeployed(_pid, wrapperProxy_, lpToken);

        return wrapperProxy_;
    }

    /// @notice Pause deposits and harvesting new rewards for the given wrappers
    /// @param _wrappers The wrappers to pause
    function pauseWrappers(address[] calldata _wrappers) external onlyOwner {
        for (uint256 i; i < _wrappers.length; i++) {
            ConvexCurveLpStakingWrapperLib(_wrappers[i]).togglePause(true);
        }
    }

    /// @notice Unpauses deposits and harvesting new rewards for the given wrappers
    /// @param _wrappers The wrappers to unpause
    function unpauseWrappers(address[] calldata _wrappers) external onlyOwner {
        for (uint256 i; i < _wrappers.length; i++) {
            ConvexCurveLpStakingWrapperLib(_wrappers[i]).togglePause(false);
        }
    }

    ////////////////////////////////////
    // BEACON PROXY FACTORY OVERRIDES //
    ////////////////////////////////////

    /// @notice Gets the contract owner
    /// @return owner_ The contract owner
    function getOwner() public view override returns (address owner_) {
        return DISPATCHER_CONTRACT.getOwner();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Gets the Curve LP token address for a given wrapper
    /// @param _wrapper The wrapper proxy address
    /// @return lpToken_ The Curve LP token address
    function getCurveLpTokenForWrapper(address _wrapper) external view returns (address lpToken_) {
        return wrapperToCurveLpToken[_wrapper];
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the wrapper address for a given Convex pool
    /// @param _pid The Convex pool id
    /// @return wrapper_ The wrapper proxy address
    function getWrapperForConvexPool(uint256 _pid) public view returns (address wrapper_) {
        return pidToWrapper[_pid];
    }
}
