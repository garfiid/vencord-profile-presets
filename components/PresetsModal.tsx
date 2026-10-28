/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, TextButton } from "@components/Button";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, TextInput, useState } from "@webpack/common";

import { exportPresets, importFromFile, loadPreset, openPresetMenu, savePresetAs } from "../actions";
import { useActivePresetId, usePresets, validateName } from "../storage";
import type { Preset } from "../types";
import { cl, errorMessage, formatDate, MAX_NAME_LENGTH } from "../utils";
import { MoreIcon } from "./icons";
import { Thumbnail } from "./Thumbnail";

export function PresetsModal(props: RenderModalProps) {
    const presets = usePresets();
    const activeId = useActivePresetId();

    return (
        <Modal
            {...props}
            size="md"
            title="Profile presets"
            subtitle="Save your profile and load it back in one click."
            actions={[{ text: "Done", variant: "primary", onClick: props.onClose }]}
        >
            <div className={cl("modal")}>
                <SaveRow />

                <div className={cl("list-header")}>
                    <span className={cl("label")}>Your presets — {presets.length}</span>
                    <span className={cl("list-links")}>
                        <TextButton variant="link" onClick={importFromFile}>Import</TextButton>
                        {presets.length > 0 && <TextButton variant="link" onClick={() => exportPresets(presets)}>Export all</TextButton>}
                    </span>
                </div>

                {presets.length === 0
                    ? <div className={cl("empty")}>No presets yet. Name your current look above and save it.</div>
                    : (
                        <div className={cl("list")}>
                            {presets.map(p => <PresetRow key={p.id} preset={p} active={p.id === activeId} onLoaded={props.onClose} />)}
                        </div>
                    )}
            </div>
        </Modal>
    );
}

function SaveRow() {
    const [name, setName] = useState("");
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    async function save() {
        if (busy) return;
        const problem = validateName(name);
        if (problem) return setError(problem);

        setBusy(true);
        try {
            await savePresetAs(name.trim());
            setName("");
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={cl("save-row")}>
            <div className={cl("save-input")}>
                <TextInput
                    value={name}
                    placeholder="Preset name"
                    maxLength={MAX_NAME_LENGTH}
                    error={error}
                    onChange={value => { setName(value); setError(undefined); }}
                    onKeyDown={e => { if (e.key === "Enter") save(); }}
                />
            </div>
            <Button variant="primary" onClick={save} disabled={busy}>Save current</Button>
        </div>
    );
}

function PresetRow({ preset, active, onLoaded }: { preset: Preset; active: boolean; onLoaded(): void; }) {
    const [busy, setBusy] = useState(false);

    async function load() {
        setBusy(true);
        const ok = await loadPreset(preset);
        setBusy(false);
        if (ok) onLoaded();
    }

    return (
        <div className={cl("row", { "row-active": active })} onContextMenu={e => openPresetMenu(e, preset, onLoaded)}>
            <Thumbnail preset={preset} variant="row" />
            <div className={cl("row-meta")}>
                <div className={cl("row-name")}>{preset.name}</div>
                <div className={cl("row-date")}>{active ? "Last loaded" : `Saved ${formatDate(preset.updatedAt)}`}</div>
            </div>
            <Button className={cl("row-load")} variant="secondary" size="small" onClick={load} disabled={busy}>Load</Button>
            <button
                type="button"
                className={cl("icon-button")}
                aria-label={`More options for ${preset.name}`}
                onClick={e => openPresetMenu(e, preset, onLoaded)}
            >
                <MoreIcon />
            </button>
        </div>
    );
}
