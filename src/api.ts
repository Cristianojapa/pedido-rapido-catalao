// Configuração da API
// Em produção, usa domínio permanente com HTTPS
// Em desenvolvimento local, configure VITE_API_BASE_URL=http://localhost:8000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.xn--centerpeasatacado-hsb.com.br';

console.log('API_BASE_URL:', API_BASE_URL);


export const api = {
    async getStores(): Promise<{ id: number; name: string; city: string | null }[]> {
        console.log('Fetching stores from:', `${API_BASE_URL}/api/public/catalog/stores/`);
        try {
            const response = await fetch(`${API_BASE_URL}/api/public/catalog/stores/`);
            console.log('Response status:', response.status);
            if (!response.ok) throw new Error('Erro ao carregar lojas');
            const data = await response.json();
            console.log('Stores data:', data);
            return data;
        } catch (error) {
            console.error('Error fetching stores:', error);
            throw error;
        }
    },

    async getProducts(storeId: number, params?: {
        group?: number;
        brand?: number;
        category?: number;
        color?: number;
        search?: string;
    }) {
        const searchParams = new URLSearchParams();
        searchParams.set('store', storeId.toString());

        if (params?.group) searchParams.set('group', params.group.toString());
        if (params?.brand) searchParams.set('brand', params.brand.toString());
        if (params?.category) searchParams.set('category', params.category.toString());
        if (params?.color) searchParams.set('color', params.color.toString());
        if (params?.search) searchParams.set('search', params.search);

        const response = await fetch(`${API_BASE_URL}/api/public/catalog/?${searchParams}`);
        if (!response.ok) throw new Error('Erro ao carregar produtos');
        return response.json();
    },

    async getFilters(storeId: number) {
        const response = await fetch(`${API_BASE_URL}/api/public/catalog/filters/?store=${storeId}`);
        if (!response.ok) throw new Error('Erro ao carregar filtros');
        return response.json();
    },
};
