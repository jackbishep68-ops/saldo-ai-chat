import type { Message } from './App';
const key = 'saldo-chat-v1';
export function loadHistory(): Message[] {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw || raw.length > 256000)
            return [];
        const value: unknown = JSON.parse(raw);
        if (!Array.isArray(value) || value.length > 80)
            return [];
        return value.filter((m): m is Message => m && typeof m.id === 'string' && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim().length > 0 && m.content.length <= 24000);
    }
    catch {
        return [];
    }
}
export function saveHistory(messages: Message[]): boolean {
    try {
        sessionStorage.setItem(key, JSON.stringify(messages.filter(m => m.content.trim()).slice(-80)));
        return true;
    }
    catch {
        return false;
    }
}
