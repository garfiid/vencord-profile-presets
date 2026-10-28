/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { chooseFile, saveFile } from "@utils/web";
import { ConfirmModal, ContextMenuApi, Menu, openModal } from "@webpack/common";
import type { MouseEvent } from "react";

import { NameModal } from "./components/NameModal";
import { PresetsModal } from "./components/PresetsModal";
import { isEditorOpen } from "./editorMount";
import { captureProfile, loadIntoEditor } from "./profile";
import { addPreset, buildExport, deletePreset, importPresets, renamePreset, replacePreset, setActivePreset } from "./storage";
import type { Preset } from "./types";
import { errorMessage, logger, toast } from "./utils";

export function openPresetsModal() {
    openModal(props => <PresetsModal {...props} />);
}

export async function savePresetAs(name: string) {
    const preset = await captureProfile(name);
    await addPreset(preset);
    setActivePreset(preset.id);
    toast(`Saved "${preset.name}"`, "success");
}

export function openSaveModal() {
    openModal(props => (
        <NameModal
            {...props}
            title="Save preset"
            subtitle="Saves your profile as it looks in the editor right now, unsaved changes included."
            confirmText="Save"
            onSubmit={savePresetAs}
        />
    ));
}

export async function loadPreset(preset: Preset) {
    try {
        const notes = await loadIntoEditor(preset);
        setActivePreset(preset.id);
        const next = isEditorOpen() ? "Check the preview, then click Save." : "Open Edit Profile and click Save.";
        toast(notes.length ? `Loaded "${preset.name}" (${notes.join(", ")}). ${next}` : `Loaded "${preset.name}". ${next}`, "success");
        return true;
    } catch (err) {
        logger.error("Couldn't load preset", err);
        toast(`Couldn't load "${preset.name}": ${errorMessage(err)}`, "critical");
        return false;
    }
}

function openRenameModal(preset: Preset) {
    openModal(props => (
        <NameModal
            {...props}
            title="Rename preset"
            confirmText="Rename"
            initialValue={preset.name}
            ignoreId={preset.id}
            onSubmit={name => renamePreset(preset.id, name)}
        />
    ));
}

function confirmUpdate(preset: Preset) {
    openModal(props => (
        <ConfirmModal
            {...props}
            title={`Update "${preset.name}"?`}
            subtitle="It will be replaced with your profile as it looks in the editor right now."
            confirmText="Update"
            variant="primary"
            onConfirm={async () => {
                try {
                    const fresh = await captureProfile(preset.name);
                    await replacePreset(preset.id, fresh);
                    toast(`Updated "${preset.name}"`, "success");
                } catch (err) {
                    logger.error("Couldn't update preset", err);
                    toast(`Couldn't update "${preset.name}": ${errorMessage(err)}`, "critical");
                }
            }}
        />
    ));
}

function confirmDelete(preset: Preset) {
    openModal(props => (
        <ConfirmModal
            {...props}
            title={`Delete "${preset.name}"?`}
            subtitle="This can't be undone."
            confirmText="Delete"
            onConfirm={() => deletePreset(preset.id)}
        />
    ));
}

export function openPresetMenu(event: MouseEvent, preset: Preset, onLoaded?: () => void) {
    ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu navId="vc-pp-preset-menu" onClose={ContextMenuApi.closeContextMenu} aria-label="Preset options">
            <Menu.MenuItem
                id="vc-pp-load"
                label="Load"
                action={async () => { if (await loadPreset(preset)) onLoaded?.(); }}
            />
            <Menu.MenuItem id="vc-pp-rename" label="Rename" action={() => openRenameModal(preset)} />
            <Menu.MenuItem id="vc-pp-update" label="Update with current profile" action={() => confirmUpdate(preset)} />
            <Menu.MenuItem id="vc-pp-export" label="Export" action={() => exportPresets([preset])} />
            <Menu.MenuSeparator />
            <Menu.MenuItem id="vc-pp-delete" label="Delete" color="danger" action={() => confirmDelete(preset)} />
        </Menu.Menu>
    ));
}

export function exportPresets(list: readonly Preset[]) {
    if (list.length === 0) {
        toast("Nothing to export");
        return;
    }
    const filename = list.length === 1
        ? `${list[0].name.replace(/[^\w-]+/g, "_") || "preset"}.json`
        : `profile-presets-${new Date().toISOString().slice(0, 10)}.json`;
    const data = new TextEncoder().encode(buildExport(list));

    if (IS_DISCORD_DESKTOP) DiscordNative.fileManager.saveWithDialog(data, filename);
    else saveFile(new File([data], filename, { type: "application/json" }));
}

export async function importFromFile() {
    let text: string | null = null;
    if (IS_DISCORD_DESKTOP) {
        const [file] = await DiscordNative.fileManager.openFiles({
            filters: [{ name: "Profile presets", extensions: ["json"] }]
        });
        if (file) text = new TextDecoder().decode(file.data);
    } else {
        const file = await chooseFile("application/json");
        if (file) text = await file.text();
    }
    if (text == null) return;

    try {
        const count = await importPresets(text);
        toast(`Imported ${count} preset${count === 1 ? "" : "s"}`, "success");
    } catch (err) {
        toast(errorMessage(err), "critical");
    }
}
