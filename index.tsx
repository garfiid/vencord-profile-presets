/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import definePlugin from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

import { openPresetsModal } from "./actions";
import { PresetsIcon } from "./components/icons";
import { startEditorMount, stopEditorMount } from "./editorMount";
import { onPendingChanges } from "./profile";
import { settings } from "./settings";
import { initStorage } from "./storage";
import managedStyle from "./styles.css?managed";

const PENDING_CHANGES = "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES";

const PresetsChatBarButton: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat) return null;
    return (
        <ChatBarButton tooltip="Profile presets" onClick={openPresetsModal}>
            <PresetsIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "ProfilePresets",
    description: "Save your whole profile (avatar, banner, bio, colors, decoration, effect, nameplate, frame, widgets) and switch between looks in one click, right from the profile editor.",
    authors: [{ name: "Emma", id: 0n }],
    settings,
    managedStyle,

    chatBarButton: {
        icon: PresetsIcon,
        render: PresetsChatBarButton
    },

    toolboxActions: {
        "Open profile presets": openPresetsModal
    },

    async start() {
        await initStorage();
        FluxDispatcher.subscribe(PENDING_CHANGES, onPendingChanges);
        startEditorMount();
    },

    stop() {
        FluxDispatcher.unsubscribe(PENDING_CHANGES, onPendingChanges);
        stopEditorMount();
    }
});
