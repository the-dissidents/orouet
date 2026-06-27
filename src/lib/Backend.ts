import { invoke } from "@tauri-apps/api/core";
import { getPassword, setPassword, deletePassword } from "tauri-plugin-keyring-api";

export const Backend = {
    async saveCompressed(path: string, content: string) {
        await invoke<void>('save_compressed', {path, content});
    },

    async readCompressed(path: string) {
        return await invoke<string>('read_compressed', {path});
    },
}

export const Secrets = {
    async get(name: string) {
        const value = await getPassword('secret', name);
        return value ?? null;
    },

    async set(name: string, value: string) {
        await setPassword('secret', name, value);
    },

    async delete(name: string) {
        await deletePassword('secret', name);
    },
}
