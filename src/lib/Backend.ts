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
        console.log('getting secret', name);
        const value = await getPassword('secret', name);
        console.log('ok');
        if (!value) return null;
        return value;
    },

    async set(name: string, value: string) {
        await setPassword('secret', name, value);
    },

    async delete(name: string) {
        console.log('removing secret', name);
        await deletePassword('secret', name);
        console.log('ok');
    },
}
