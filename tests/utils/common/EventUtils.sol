// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {VmSafe} from "forge-std/Vm.sol";

import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";

abstract contract EventUtils is CommonUtilsBase {
    function expectEmit(address _emitter) internal {
        vm.expectEmit(true, true, true, true, _emitter);
    }

    function filterLogsMatchingSelector(VmSafe.Log[] memory _logs, bytes32 _selector)
        internal
        pure
        returns (VmSafe.Log[] memory logsWithSelector_)
    {
        return __filterLogsMatchingSelector(_logs, _selector, address(0), false);
    }

    function filterLogsMatchingSelector(VmSafe.Log[] memory _logs, bytes32 _selector, address _emitter)
        internal
        pure
        returns (VmSafe.Log[] memory logsWithSelector_)
    {
        return __filterLogsMatchingSelector(_logs, _selector, _emitter, true);
    }

    function __filterLogsMatchingSelector(
        VmSafe.Log[] memory _logs,
        bytes32 _selector,
        address _emitter,
        bool _filterByEmitter
    ) private pure returns (VmSafe.Log[] memory logsWithSelector_) {
        uint256 logsMatchCount;
        bool[] memory logsMatch = new bool[](_logs.length);
        for (uint256 i; i < _logs.length; i++) {
            VmSafe.Log memory log = _logs[i];

            if ((!_filterByEmitter || log.emitter == _emitter) && log.topics[0] == _selector) {
                logsMatch[i] = true;
                logsMatchCount++;
            }
        }

        logsWithSelector_ = new VmSafe.Log[](logsMatchCount);
        uint256 logsWithSelectorIndex;
        for (uint256 i; i < _logs.length; i++) {
            if (logsMatch[i]) {
                logsWithSelector_[logsWithSelectorIndex] = _logs[i];

                logsWithSelectorIndex++;
            }
        }

        return logsWithSelector_;
    }

    function assertAtLeastOneEventMatches(VmSafe.Log[] memory _logs, bytes32 _selector, address _emitter)
        internal
        pure
    {
        VmSafe.Log[] memory logsWithSelector = filterLogsMatchingSelector(_logs, _selector, _emitter);
        require(logsWithSelector.length > 0, "No matching events found");
    }

    function assertExactlyOneEventMatches(VmSafe.Log[] memory _logs, bytes32 _selector, address _emitter)
        internal
        pure
    {
        VmSafe.Log[] memory logsWithSelector = filterLogsMatchingSelector(_logs, _selector, _emitter);
        require(logsWithSelector.length == 1, "More than one matching event found");
    }
}
