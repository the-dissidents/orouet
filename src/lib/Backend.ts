import { invoke } from "@tauri-apps/api/core";
import { Client, Store, Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

export const Backend = {
    async saveCompressed(path: string, content: string) {
        await invoke<void>('save_compressed', {path, content});
    },

    async readCompressed(path: string) {
        return await invoke<string>('read_compressed', {path});
    },

    async getSecret(name: string) {

    }
}

let client: Client;
let store: Store;
let stronghold: Stronghold;

export const Secrets = {
    async init() {
        console.log('loading secrets');
        const vaultPath = `${await appDataDir()}/vault.hold`;
        const vaultPassword = 'secrets';
        const clientName = 'secrets';

        stronghold = await Stronghold.load(vaultPath, vaultPassword);
        try {
            client = await stronghold.loadClient(clientName);
        } catch {
            client = await stronghold.createClient(clientName);
        }
        store = client.getStore();

        console.log('loaded secrets');
    },

    async save() {
        await stronghold.save();
        console.log('saved secrets');
    },

    async get(name: string) {
        console.log('getting secret', name);
        const data = await store.get(name);
        console.log('ok');
        if (!data) return null;
        return new TextDecoder().decode(new Uint8Array(data));
    },

    async set(name: string, value: string) {
        const data = Array.from(new TextEncoder().encode(value));
        console.log('setting secret', name);
        await store.insert(name, data);
        console.log('ok');
    },

    async delete(name: string) {
        console.log('removing secret', name);
        await store.remove(name);
        console.log('ok');
    },
}
