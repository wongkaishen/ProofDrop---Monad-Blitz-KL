// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ProofDropQuest
/// @notice Lightweight registry of quests the dApp displays to users.
///         The badge contract is the source of truth for who has *completed*
///         a quest; this contract only stores quest metadata.
contract ProofDropQuest is Ownable {
    struct Quest {
        uint256 id;
        string title;
        string description;
        string imageURI;
        bool active;
    }

    uint256 public nextQuestId;
    mapping(uint256 => Quest) private _quests;
    uint256[] private _questIds;

    event QuestCreated(uint256 indexed id, string title);
    event QuestUpdated(uint256 indexed id, bool active);

    constructor() Ownable(msg.sender) {}

    function createQuest(
        string calldata title,
        string calldata description,
        string calldata imageURI
    ) external onlyOwner returns (uint256 id) {
        id = ++nextQuestId;
        _quests[id] = Quest({
            id: id,
            title: title,
            description: description,
            imageURI: imageURI,
            active: true
        });
        _questIds.push(id);
        emit QuestCreated(id, title);
    }

    function setActive(uint256 id, bool active) external onlyOwner {
        require(_quests[id].id != 0, "no quest");
        _quests[id].active = active;
        emit QuestUpdated(id, active);
    }

    function getQuest(uint256 id) external view returns (Quest memory) {
        require(_quests[id].id != 0, "no quest");
        return _quests[id];
    }

    function allQuests() external view returns (Quest[] memory list) {
        list = new Quest[](_questIds.length);
        for (uint256 i = 0; i < _questIds.length; i++) {
            list[i] = _quests[_questIds[i]];
        }
    }
}
