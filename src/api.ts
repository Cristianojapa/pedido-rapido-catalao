import type {
  Bank,
  CartItem,
  CatalogResponse,
  CustomerPortalUser,
  CustomerSession,
  CustomerStatement,
  Customer,
  EligiblePurchaseItem,
  EmployeeSession,
  EmployeeUser,
  Filters,
  OperationalRequest,
  OperationalRequestInput,
  PublicOrderResponse,
  Store,
} from './types';

const PRODUCTION_API_URL = 'https://api.xn--centerpeasatacado-hsb.com.br';
const API_BASE_URL = (import.meta.env.VITE_API_URL || PRODUCTION_API_URL).replace(/\/+$/, '');

export const EMPLOYEE_ACCESS_TOKEN_KEY = 'employeeAccessToken';
export const EMPLOYEE_REFRESH_TOKEN_KEY = 'employeeRefreshToken';
export const CUSTOMER_ACCESS_TOKEN_KEY = 'customerPortalAccessToken';
export const CUSTOMER_REFRESH_TOKEN_KEY = 'customerPortalRefreshToken';
export const EMPLOYEE_UNAUTHORIZED_EVENT = 'quick-order:employee-unauthorized';
export const CUSTOMER_UNAUTHORIZED_EVENT = 'quick-order:customer-unauthorized';

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE_URL) return normalizedPath;
  if (API_BASE_URL.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${API_BASE_URL}${normalizedPath.slice(4)}`;
  }
  return `${API_BASE_URL}${normalizedPath}`;
}

function collectErrorMessages(payload: unknown, messages: string[], depth = 0): void {
  if (depth > 5 || payload === null || payload === undefined) return;
  if (typeof payload === 'string') {
    const value = payload.trim();
    if (value) messages.push(value);
    return;
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    messages.push(String(payload));
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((value) => collectErrorMessages(value, messages, depth + 1));
    return;
  }
  if (typeof payload === 'object') {
    Object.values(payload as Record<string, unknown>).forEach((value) => {
      collectErrorMessages(value, messages, depth + 1);
    });
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  const messages: string[] = [];
  collectErrorMessages(payload, messages);
  const unique = [...new Set(messages)];
  return unique.length ? unique.slice(0, 3).join(' ') : fallback;
}

export function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  fallbackError = 'Não foi possível concluir a solicitação.',
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(buildUrl(path), { ...init, headers });
  const data = await readJson(response);
  if (!response.ok) throw new Error(extractErrorMessage(data, fallbackError));
  return data as T;
}

function getEmployeeAccessToken(): string | null {
  return localStorage.getItem(EMPLOYEE_ACCESS_TOKEN_KEY);
}

function getEmployeeRefreshToken(): string | null {
  return localStorage.getItem(EMPLOYEE_REFRESH_TOKEN_KEY);
}

function saveEmployeeTokens(access: string, refresh: string): void {
  localStorage.setItem(EMPLOYEE_ACCESS_TOKEN_KEY, access);
  localStorage.setItem(EMPLOYEE_REFRESH_TOKEN_KEY, refresh);
}

export function clearEmployeeTokens(): void {
  localStorage.removeItem(EMPLOYEE_ACCESS_TOKEN_KEY);
  localStorage.removeItem(EMPLOYEE_REFRESH_TOKEN_KEY);
}

function dispatchUnauthorized(eventName: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName));
}

function expireEmployeeSession(): void {
  clearEmployeeTokens();
  dispatchUnauthorized(EMPLOYEE_UNAUTHORIZED_EVENT);
}

let employeeRefreshPromise: Promise<string> | null = null;

async function refreshEmployeeAccessToken(): Promise<string> {
  if (employeeRefreshPromise) return employeeRefreshPromise;
  const refresh = getEmployeeRefreshToken();
  if (!refresh) {
    expireEmployeeSession();
    throw new Error('Sua sessão expirou. Entre novamente.');
  }

  employeeRefreshPromise = (async () => {
    try {
      const data = await requestJson<{ access: string; refresh?: string }>(
        '/api/accounts/token/refresh/',
        { method: 'POST', body: JSON.stringify({ refresh }) },
        'Sua sessão expirou. Entre novamente.',
      );
      if (getEmployeeRefreshToken() !== refresh) {
        throw new Error('Sua sessão foi encerrada. Entre novamente.');
      }
      saveEmployeeTokens(data.access, data.refresh || refresh);
      return data.access;
    } catch (error) {
      expireEmployeeSession();
      throw error;
    }
  })();

  try {
    return await employeeRefreshPromise;
  } finally {
    employeeRefreshPromise = null;
  }
}

async function employeeRequest<T>(
  path: string,
  init: RequestInit = {},
  fallbackError?: string,
  allowRefresh = true,
): Promise<T> {
  const token = getEmployeeAccessToken();
  if (!token) {
    expireEmployeeSession();
    throw new Error('Entre na Área do funcionário para continuar.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(buildUrl(path), { ...init, headers });
  if (response.status === 401 && allowRefresh) {
    const newAccess = await refreshEmployeeAccessToken();
    headers.set('Authorization', `Bearer ${newAccess}`);
    return employeeRequest<T>(path, { ...init, headers }, fallbackError, false);
  }

  const data = await readJson(response);
  if (!response.ok) {
    if (response.status === 401) expireEmployeeSession();
    throw new Error(extractErrorMessage(data, fallbackError || 'Não foi possível concluir a solicitação.'));
  }
  return data as T;
}

function getCustomerAccessToken(): string | null {
  return localStorage.getItem(CUSTOMER_ACCESS_TOKEN_KEY);
}

function getCustomerRefreshToken(): string | null {
  return localStorage.getItem(CUSTOMER_REFRESH_TOKEN_KEY);
}

function saveCustomerTokens(access: string, refresh: string): void {
  localStorage.setItem(CUSTOMER_ACCESS_TOKEN_KEY, access);
  localStorage.setItem(CUSTOMER_REFRESH_TOKEN_KEY, refresh);
}

export function clearCustomerTokens(): void {
  localStorage.removeItem(CUSTOMER_ACCESS_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_REFRESH_TOKEN_KEY);
}

function expireCustomerSession(): void {
  clearCustomerTokens();
  dispatchUnauthorized(CUSTOMER_UNAUTHORIZED_EVENT);
}

let customerRefreshPromise: Promise<string> | null = null;

async function refreshCustomerAccessToken(): Promise<string> {
  if (customerRefreshPromise) return customerRefreshPromise;
  const refresh = getCustomerRefreshToken();
  if (!refresh) {
    expireCustomerSession();
    throw new Error('Sua sessão expirou. Entre novamente.');
  }

  customerRefreshPromise = (async () => {
    try {
      const data = await requestJson<{ access: string; refresh: string }>(
        '/api/public/customer-auth/refresh/',
        { method: 'POST', body: JSON.stringify({ refresh }) },
        'Sua sessão expirou. Entre novamente.',
      );
      if (getCustomerRefreshToken() !== refresh) {
        throw new Error('Sua sessão foi encerrada. Entre novamente.');
      }
      saveCustomerTokens(data.access, data.refresh);
      return data.access;
    } catch (error) {
      expireCustomerSession();
      throw error;
    }
  })();

  try {
    return await customerRefreshPromise;
  } finally {
    customerRefreshPromise = null;
  }
}

async function customerRequest<T>(
  path: string,
  init: RequestInit = {},
  fallbackError?: string,
  allowRefresh = true,
): Promise<T> {
  const token = getCustomerAccessToken();
  if (!token) {
    expireCustomerSession();
    throw new Error('Entre em Meu extrato para continuar.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(buildUrl(path), { ...init, headers });
  if (response.status === 401 && allowRefresh) {
    const newAccess = await refreshCustomerAccessToken();
    headers.set('Authorization', `Bearer ${newAccess}`);
    return customerRequest<T>(path, { ...init, headers }, fallbackError, false);
  }

  const data = await readJson(response);
  if (!response.ok) {
    if (response.status === 401) expireCustomerSession();
    throw new Error(extractErrorMessage(data, fallbackError || 'Não foi possível carregar seu extrato.'));
  }
  return data as T;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results as T[];
    if (Array.isArray(record.customers)) return record.customers as T[];
    if (Array.isArray(record.requests)) return record.requests as T[];
    if (Array.isArray(record.purchases)) return record.purchases as T[];
  }
  return [];
}

function normalizeEligiblePurchases(data: unknown): EligiblePurchaseItem[] {
  const purchases = unwrapList<Record<string, unknown>>(data);
  const normalized: EligiblePurchaseItem[] = [];

  purchases.forEach((purchase) => {
    const nestedItems = Array.isArray(purchase.items)
      ? (purchase.items as Record<string, unknown>[])
      : [purchase];
    const orderId = (purchase.order_id ?? purchase.source_order_id ?? purchase.order ?? purchase.id) as number | string;
    const orderDate = (purchase.order_date ?? purchase.sale_date ?? purchase.created_at ?? purchase.date ?? null) as string | null;
    const orderLabel = String(purchase.order_number ?? purchase.order_label ?? `#${orderId}`);

    nestedItems.forEach((item) => {
      const sourceItemId = (
        item.order_item_id
        ?? item.source_order_item_id
        ?? item.source_order_item
        ?? item.order_item
        ?? item.id
      ) as number | string;
      const productValue = item.product;
      const product = productValue && typeof productValue === 'object'
        ? productValue as Record<string, unknown>
        : null;
      const productId = String(item.product_id ?? product?.id ?? '');
      if (!productId || sourceItemId === undefined || orderId === undefined) return;

      normalized.push({
        source_order_id: (item.order_id ?? item.source_order_id ?? item.order ?? orderId) as number | string,
        source_order_item_id: sourceItemId,
        order_label: String(item.order_number ?? item.order_label ?? orderLabel),
        order_date: (item.order_date ?? item.sale_date ?? item.created_at ?? orderDate) as string | null,
        product_id: productId,
        description: String(
          item.product_description ?? item.description ?? product?.description ?? product?.name ?? 'Produto',
        ),
        color: (item.color ?? product?.color ?? null) as string | null,
        purchased_quantity: Number(item.purchased_quantity ?? item.quantity ?? 1),
        eligible_quantity: Number(
          item.eligible_quantity ?? item.available_quantity ?? item.quantity_available ?? item.quantity ?? 1,
        ),
      });
    });
  });

  return normalized;
}

export function employeeHasQuickOrderAccess(user: EmployeeUser): boolean {
  return user.is_superuser || user.permissions?.includes('sales.access_quick_order');
}

export const api = {
  async getStores(): Promise<Store[]> {
    return requestJson<Store[]>('/api/public/catalog/stores/', {}, 'Erro ao carregar lojas.');
  },

  async getProducts(
    storeId: number,
    params?: { group?: number; brand?: number; category?: number; color?: number; search?: string },
  ): Promise<CatalogResponse> {
    const searchParams = new URLSearchParams({ store: String(storeId) });
    if (params?.group) searchParams.set('group', String(params.group));
    if (params?.brand) searchParams.set('brand', String(params.brand));
    if (params?.category) searchParams.set('category', String(params.category));
    if (params?.color) searchParams.set('color', String(params.color));
    if (params?.search) searchParams.set('search', params.search);
    return requestJson<CatalogResponse>(
      `/api/public/catalog/?${searchParams}`,
      {},
      'Erro ao carregar produtos.',
    );
  },

  async getEmployeeStockLevels(storeId: number): Promise<Record<string, number>> {
    return employeeRequest<Record<string, number>>(
      '/api/operational-requests/stock-levels/?store=' + storeId,
      {},
      'Não foi possível carregar o estoque da loja.',
    );
  },
  async getFilters(
    storeId: number,
    params?: { group?: number; brand?: number; category?: number },
  ): Promise<Filters> {
    const searchParams = new URLSearchParams({ store: String(storeId) });
    if (params?.group) searchParams.set('group', String(params.group));
    if (params?.brand) searchParams.set('brand', String(params.brand));
    if (params?.category) searchParams.set('category', String(params.category));
    return requestJson<Filters>(
      '/api/public/catalog/filters/?' + searchParams,
      {},
      'Erro ao carregar filtros.',
    );
  },

  async createOrder(data: {
    store: number;
    customer_name?: string;
    customer_phone?: string;
    items: Array<{ product_id: string; description?: string; quantity: number; price?: number }>;
  }): Promise<PublicOrderResponse> {
    const clientRequestId = createClientRequestId();
    return requestJson<PublicOrderResponse>(
      '/api/public/orders/',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': clientRequestId },
        body: JSON.stringify({ ...data, client_request_id: clientRequestId }),
      },
      'Não foi possível registrar o pedido. Tente novamente.',
    );
  },

  async createPublicOrder(
    storeId: number,
    customer: { name: string; phone: string },
    items: CartItem[],
    clientRequestId: string,
  ): Promise<PublicOrderResponse> {
    return requestJson<PublicOrderResponse>(
      '/api/public/orders/',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': clientRequestId },
        body: JSON.stringify({
          store: storeId,
          customer_name: customer.name,
          customer_phone: customer.phone,
          client_request_id: clientRequestId,
          items: items.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
        }),
      },
      'Não foi possível registrar o pedido. Tente novamente.',
    );
  },

  async loginEmployee(email: string, password: string): Promise<EmployeeSession> {
    const login = await requestJson<{ tokens: { access: string; refresh: string } }>(
      '/api/accounts/login/',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      'E-mail ou senha inválidos.',
    );
    saveEmployeeTokens(login.tokens.access, login.tokens.refresh);

    try {
      const user = await this.getEmployeeMe();
      if (!employeeHasQuickOrderAccess(user)) {
        clearEmployeeTokens();
        throw new Error('Seu usuário não tem acesso ao Pedido Rápido.');
      }
      return { access: login.tokens.access, refresh: login.tokens.refresh, user };
    } catch (error) {
      clearEmployeeTokens();
      throw error;
    }
  },

  async restoreEmployeeSession(): Promise<EmployeeSession | null> {
    const access = getEmployeeAccessToken();
    const refresh = getEmployeeRefreshToken();
    if (!access || !refresh) return null;

    try {
      const user = await this.getEmployeeMe();
      if (!employeeHasQuickOrderAccess(user)) {
        clearEmployeeTokens();
        return null;
      }
      return {
        access: getEmployeeAccessToken() || access,
        refresh: getEmployeeRefreshToken() || refresh,
        user,
      };
    } catch {
      clearEmployeeTokens();
      return null;
    }
  },

  async getEmployeeMe(): Promise<EmployeeUser> {
    return employeeRequest<EmployeeUser>('/api/accounts/me/', {}, 'Não foi possível validar seu acesso.');
  },

  async logoutEmployee(): Promise<void> {
    const refresh = getEmployeeRefreshToken();
    try {
      if (refresh) {
        await employeeRequest('/api/accounts/logout/', {
          method: 'POST',
          body: JSON.stringify({ refresh }),
        });
      }
    } finally {
      clearEmployeeTokens();
    }
  },

  async loginCustomer(identifier: string, password: string): Promise<CustomerSession> {
    const login = await requestJson<{
      user: CustomerPortalUser;
      tokens: { access: string; refresh: string };
    }>(
      '/api/public/customer-auth/login/',
      { method: 'POST', body: JSON.stringify({ identifier, password }) },
      'Telefone, e-mail ou senha inválidos.',
    );
    saveCustomerTokens(login.tokens.access, login.tokens.refresh);
    return { access: login.tokens.access, refresh: login.tokens.refresh, user: login.user };
  },

  async restoreCustomerSession(): Promise<CustomerSession | null> {
    const access = getCustomerAccessToken();
    const refresh = getCustomerRefreshToken();
    if (!access || !refresh) return null;

    try {
      const user = await this.getCustomerMe();
      return {
        access: getCustomerAccessToken() || access,
        refresh: getCustomerRefreshToken() || refresh,
        user,
      };
    } catch {
      clearCustomerTokens();
      return null;
    }
  },

  async getCustomerMe(): Promise<CustomerPortalUser> {
    return customerRequest<CustomerPortalUser>(
      '/api/public/customer-auth/me/',
      {},
      'Não foi possível validar seu acesso ao extrato.',
    );
  },

  async getCustomerStatement(params?: { startDate?: string; endDate?: string }): Promise<CustomerStatement> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('start_date', params.startDate);
    if (params?.endDate) searchParams.set('end_date', params.endDate);
    const query = searchParams.size ? `?${searchParams}` : '';
    return customerRequest<CustomerStatement>(
      `/api/public/customer-auth/statement/${query}`,
      {},
      'Não foi possível carregar seu extrato.',
    );
  },

  logoutCustomer(): void {
    clearCustomerTokens();
  },

  async getCustomers(storeId: number, search = ''): Promise<Customer[]> {
    const params = new URLSearchParams({ store: String(storeId) });
    if (search.trim()) params.set('search', search.trim());
    const data = await employeeRequest<unknown>(
      `/api/operational-requests/customers/?${params}`,
      {},
      'Não foi possível carregar os clientes.',
    );
    return unwrapList<Record<string, unknown>>(data).map((customer) => ({
      id: customer.id as number | string,
      name: String(customer.name ?? customer.full_name ?? customer.display_name ?? 'Cliente'),
      phone: (customer.phone ?? customer.address_phone ?? customer.cellphone ?? null) as string | null,
      document: (customer.document ?? customer.document_number ?? customer.cpf_cnpj ?? null) as string | null,
    }));
  },

  async getBanks(): Promise<Bank[]> {
    const data = await employeeRequest<unknown>(
      '/api/operational-requests/banks/',
      {},
      'Não foi possível carregar os bancos.',
    );
    return unwrapList<Record<string, unknown>>(data).map((bank) => ({
      id: bank.id as number | string,
      name: String(bank.name ?? bank.description ?? 'Banco'),
    }));
  },

  async getEligiblePurchases(customerId: number | string, storeId: number): Promise<EligiblePurchaseItem[]> {
    const params = new URLSearchParams({ customer: String(customerId), store: String(storeId) });
    const data = await employeeRequest<unknown>(
      `/api/operational-requests/eligible-purchases/?${params}`,
      {},
      'Não foi possível carregar as compras elegíveis.',
    );
    return normalizeEligiblePurchases(data);
  },

  async createOperationalRequest(
    payload: OperationalRequestInput,
    clientRequestId: string,
  ): Promise<OperationalRequest> {
    return employeeRequest<OperationalRequest>(
      '/api/operational-requests/',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': clientRequestId },
        body: JSON.stringify({ ...payload, client_request_id: clientRequestId }),
      },
      'Não foi possível enviar a solicitação.',
    );
  },

  async deliverOperationalRequest(requestId: number | string): Promise<OperationalRequest> {
    return employeeRequest<OperationalRequest>(
      `/api/operational-requests/${requestId}/deliver/`,
      { method: 'POST', body: JSON.stringify({}) },
      'Não foi possível confirmar a entrega.',
    );
  },

  async getMyOperationalRequests(): Promise<OperationalRequest[]> {
    let data = await employeeRequest<unknown>(
      '/api/operational-requests/?submitted_by=me&page_size=100',
      {},
      'Não foi possível carregar suas solicitações.',
    );
    const rows = unwrapList<Record<string, unknown>>(data);
    const visitedPages = new Set<string>();

    while (data && typeof data === 'object') {
      const links = (data as Record<string, unknown>).links;
      const next = links && typeof links === 'object'
        ? (links as Record<string, unknown>).next
        : null;
      if (typeof next !== 'string' || !next || visitedPages.has(next)) break;
      visitedPages.add(next);
      const parsed = new URL(next, window.location.origin);
      data = await employeeRequest<unknown>(
        `${parsed.pathname}${parsed.search}`,
        {},
        'Não foi possível carregar todas as suas solicitações.',
      );
      rows.push(...unwrapList<Record<string, unknown>>(data));
    }

    return rows.map((request) => {
      const store = request.store;
      const customer = request.customer;
      return {
        ...request,
        id: request.id as number | string,
        type: String(request.type ?? request.request_type ?? 'SALE') as OperationalRequest['type'],
        status: String(request.status ?? 'NEW'),
        created_at: String(request.created_at ?? ''),
        store_name: String(
          request.store_name
          ?? (store && typeof store === 'object' ? (store as Record<string, unknown>).name : '')
          ?? '',
        ),
        customer_name: String(
          request.customer_name
          ?? (customer && typeof customer === 'object' ? (customer as Record<string, unknown>).name : '')
          ?? '',
        ),
      } as OperationalRequest;
    });
  },
};
