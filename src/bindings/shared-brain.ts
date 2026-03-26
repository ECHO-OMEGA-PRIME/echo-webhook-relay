import { D1Client } from 'cloudflare-d1';

export const SHARED_BRAIN = {
  get: async (key: string) => {
    const d1Client = new D1Client();
    const value = await d1Client.get('shared-brain', key);
    return value;
  },
  put: async (key: string, value: any) => {
    const d1Client = new D1Client();
    await d1Client.put('shared-brain', key, value);
  },
};