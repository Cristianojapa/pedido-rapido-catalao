// Customer Portal Auth API
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.xn--centerpeasatacado-hsb.com.br';

const TOKEN_KEY = 'customer_portal_token';
const REFRESH_KEY = 'customer_portal_refresh';
const USER_KEY = 'customer_portal_user';

export interface CustomerPortalUser {
    id: number;
    phone: string | null;
    email: string | null;
    name: string;
    linked_customer_id: number | null;
    linked_customer_name: string | null;
    has_statement_access: boolean;
    created_at: string;
}

export interface StatementMovement {
    date: string | null;
    type: string;
    description: string;
    debit: number;
    credit: number;
    running_balance: number;
    reference_id: number | null;
}

export interface StatementResponse {
    customer_id: number;
    customer_name: string;
    phone: string;
    historical_debt: number;
    credit_balance: number;
    current_balance: number;
    previous_balance: number;
    movements: StatementMovement[];
}

// Token Management
export function getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
}

export function getSavedUser(): CustomerPortalUser | null {
    const data = localStorage.getItem(USER_KEY);
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

function saveAuth(tokens: { access: string; refresh: string }, user: CustomerPortalUser) {
    localStorage.setItem(TOKEN_KEY, tokens.access);
    localStorage.setItem(REFRESH_KEY, tokens.refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    // Also save name for backwards compatibility with cart
    localStorage.setItem('pedido_rapido_customer_name', user.name);
}

export function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAccessToken();
    if (!token) throw new Error('Não autenticado');

    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
        'Authorization': `Bearer ${token}`,
    };

    let response = await fetch(url, { ...options, headers });

    // If 401, try to refresh
    if (response.status === 401) {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
            clearAuth();
            throw new Error('Sessão expirada. Faça login novamente.');
        }

        try {
            const refreshRes = await fetch(`${API_BASE_URL}/api/public/customer-auth/refresh/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh: refreshToken }),
            });

            if (!refreshRes.ok) {
                clearAuth();
                throw new Error('Sessão expirada. Faça login novamente.');
            }

            const newTokens = await refreshRes.json();
            localStorage.setItem(TOKEN_KEY, newTokens.access);
            localStorage.setItem(REFRESH_KEY, newTokens.refresh);

            // Retry original request with new token
            headers['Authorization'] = `Bearer ${newTokens.access}`;
            response = await fetch(url, { ...options, headers });
        } catch {
            clearAuth();
            throw new Error('Sessão expirada. Faça login novamente.');
        }
    }

    return response;
}

// API Methods
export const customerApi = {
    async register(data: {
        phone?: string;
        email?: string;
        name: string;
        password: string;
    }): Promise<{ user: CustomerPortalUser; tokens: { access: string; refresh: string } }> {
        const response = await fetch(`${API_BASE_URL}/api/public/customer-auth/register/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            // Flatten errors from DRF
            const messages: string[] = [];
            if (typeof error === 'object') {
                for (const [, value] of Object.entries(error)) {
                    if (Array.isArray(value)) {
                        messages.push(...value.map(String));
                    } else if (typeof value === 'string') {
                        messages.push(value);
                    }
                }
            }
            throw new Error(messages.join(' ') || 'Erro ao criar conta.');
        }

        const result = await response.json();
        saveAuth(result.tokens, result.user);
        return result;
    },

    async login(identifier: string, password: string): Promise<{ user: CustomerPortalUser; tokens: { access: string; refresh: string } }> {
        const response = await fetch(`${API_BASE_URL}/api/public/customer-auth/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            const messages: string[] = [];
            if (typeof error === 'object') {
                if (error.non_field_errors) {
                    messages.push(...error.non_field_errors);
                } else {
                    for (const [, value] of Object.entries(error)) {
                        if (Array.isArray(value)) {
                            messages.push(...value.map(String));
                        } else if (typeof value === 'string') {
                            messages.push(value);
                        }
                    }
                }
            }
            throw new Error(messages.join(' ') || 'Credenciais inválidas.');
        }

        const result = await response.json();
        saveAuth(result.tokens, result.user);
        return result;
    },

    async getMe(): Promise<CustomerPortalUser> {
        const response = await authFetch(`${API_BASE_URL}/api/public/customer-auth/me/`);
        if (!response.ok) throw new Error('Erro ao carregar dados do usuário.');
        return response.json();
    },

    async getStatement(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<StatementResponse> {
        const searchParams = new URLSearchParams();
        if (params?.start_date) searchParams.set('start_date', params.start_date);
        if (params?.end_date) searchParams.set('end_date', params.end_date);

        const url = `${API_BASE_URL}/api/public/customer-auth/statement/?${searchParams}`;
        const response = await authFetch(url);

        if (response.status === 403) {
            const data = await response.json();
            if (data.not_linked) {
                throw new Error('NOT_LINKED');
            }
            throw new Error(data.detail || 'Acesso negado.');
        }

        if (!response.ok) throw new Error('Erro ao carregar extrato.');
        return response.json();
    },
};
