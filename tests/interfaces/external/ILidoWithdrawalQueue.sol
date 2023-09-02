// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ILidoWithdrawalQueue {
    struct BatchesCalculationState {
        uint256 remainingEthBudget;
        bool finished;
        uint256[36] batches;
        uint256 batchesLength;
    }

    function calculateFinalizationBatches(
        uint256 _maxShareRate,
        uint256 _maxTimestamp,
        uint256 _maxRequestsPerCall,
        BatchesCalculationState memory _state
    ) external view returns (BatchesCalculationState memory state_);

    function finalize(uint256 _lastRequestIdToBeFinalized, uint256 _maxShareRate) external payable;

    function FINALIZE_ROLE() external view returns (bytes32 role_);

    function findCheckpointHints(uint256[] calldata _requestIds, uint256 _firstIndex, uint256 _lastIndex)
        external
        view
        returns (uint256[] memory hintIds_);

    function getLastCheckpointIndex() external view returns (uint256 lastCheckpointIndex_);

    function getLastRequestId() external view returns (uint256 lastRequestId_);

    function getRoleMember(bytes32 _role, uint256 _index) external view returns (address member_);

    function prefinalize(uint256[] calldata _batches, uint256 _maxShareRate)
        external
        view
        returns (uint256 ethToLock_, uint256 sharesToBurn_);
}
