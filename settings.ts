/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    firstSectionTitle: {
        type: OptionType.STRING,
        description: "Title of the first section in the profile editor sidebar. Used to find where to add Presets: change it if your Discord isn't in English.",
        default: "Nameplate"
    },
    lastSectionTitle: {
        type: OptionType.STRING,
        description: "Title of the last section in the profile editor sidebar. Presets is added right after it.",
        default: "Profile Effect & Frame"
    }
});
