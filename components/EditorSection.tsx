/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TextButton } from "@components/Button";
import { useState } from "@webpack/common";

import { loadPreset, openPresetMenu, openPresetsModal, openSaveModal } from "../actions";
import { useActivePresetId, usePresets } from "../storage";
import type { Preset } from "../types";
import { cl } from "../utils";
import { PlusIcon } from "./icons";
import { Thumbnail } from "./Thumbnail";

/** The "Presets" block added to the profile editor sidebar. */
export function EditorSection({ headingClassName }: { headingClassName: string; }) {
    const presets = usePresets();
    const activeId = useActivePresetId();

    return (
        <section className={cl("section")} aria-label="Presets">
            <div className={cl("section-header")}>
                <div className={headingClassName}>Presets</div>
                {presets.length > 0 && <TextButton variant="link" onClick={openPresetsModal}>Manage</TextButton>}
            </div>
            <div className={cl("grid")}>
                {presets.map(p => <PresetTile key={p.id} preset={p} active={p.id === activeId} />)}
                <button type="button" className={cl("tile", "tile-add")} onClick={openSaveModal}>
                    <span className={cl("tile-plus")}><PlusIcon /></span>
                    <span className={cl("tile-name")}>Save current</span>
                </button>
            </div>
        </section>
    );
}

function PresetTile({ preset, active }: { preset: Preset; active: boolean; }) {
    const [busy, setBusy] = useState(false);

    async function load() {
        if (busy) return;
        setBusy(true);
        await loadPreset(preset);
        setBusy(false);
    }

    return (
        <button
            type="button"
            className={cl("tile", { "tile-active": active })}
            disabled={busy}
            title={`Load ${preset.name}`}
            onClick={load}
            onContextMenu={e => openPresetMenu(e, preset)}
        >
            <Thumbnail preset={preset} variant="tile" />
            <span className={cl("tile-name")}>{preset.name}</span>
        </button>
    );
}
