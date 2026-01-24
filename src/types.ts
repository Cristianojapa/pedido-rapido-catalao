// Tipos para a API
export interface Store {
    id: number;
    name: string;
    city: string | null;
}

export interface Product {
    id: string;
    description: string;
    group: string | null;
    group_id: number;
    category: string | null;
    category_id: number;
    brand: string | null;
    brand_id: number;
    color: string | null;
    color_id: number;
    price: number;
    available: boolean;
}

export interface Filter {
    id: number;
    name: string;
}

export interface Filters {
    groups: Filter[];
    brands: Filter[];
    categories: Filter[];
    colors: Filter[];
}

export interface CatalogResponse {
    store: {
        id: number;
        name: string;
    };
    products: Product[];
    total: number;
}

export interface CartItem {
    product: Product;
    quantity: number;
}
