import { useState, useEffect, useCallback } from 'react';
import './index.css';
import { api } from './api';
import type { Store, Product, Filters, CartItem } from './types';
import { formatCurrency, openWhatsApp } from './whatsapp';

// Header Component
function Header({ onBack, showBack, storeName }: { onBack?: () => void; showBack?: boolean; storeName?: string }) {
  return (
    <header className="header">
      <h1>
        <span className="logo">CJ</span>
        Cristianojapa {storeName && `- ${storeName}`}
      </h1>
      {showBack && (
        <button className="header-back" onClick={onBack}>
          ← Trocar Loja
        </button>
      )}
    </header>
  );
}

// Store Selection Page
function StoreSelectPage({ stores, onSelect, loading }: {
  stores: Store[];
  onSelect: (store: Store) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="store-select-page">
        <div className="loading">Carregando lojas...</div>
      </div>
    );
  }

  return (
    <div className="store-select-page">
      <h2>Bem-vindo ao Catálogo!</h2>
      <p>Selecione uma loja para ver os produtos disponíveis</p>
      <div className="stores-grid">
        {stores.map((store) => (
          <div key={store.id} className="store-card" onClick={() => onSelect(store)}>
            <h3>{store.name}</h3>
            {store.city && <span>{store.city}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Filter Chips Component
function FilterChips({
  label,
  items,
  activeId,
  onSelect
}: {
  label: string;
  items: { id: number; name: string }[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="filter-group">
      <span className="filter-label">{label}</span>
      <div className="filter-chips">
        <button
          className={`chip ${activeId === null ? 'active' : ''}`}
          onClick={() => onSelect(null)}
        >
          Todos
        </button>
        {items.map((item) => (
          <button
            key={item.id}
            className={`chip ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Quantity Input Component
function QuantityInput({
  quantity,
  onChange
}: {
  quantity: number;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="quantity-input">
      <button onClick={() => onChange(-1)}>−</button>
      <span>{quantity}</span>
      <button onClick={() => onChange(1)}>+</button>
    </div>
  );
}

// Product Table Component
function ProductTable({
  products,
  cart,
  onQuantityChange,
  loading
}: {
  products: Product[];
  cart: Map<string, CartItem>;
  onQuantityChange: (product: Product, delta: number) => void;
  loading: boolean;
}) {
  if (loading) {
    return <div className="loading">Carregando produtos...</div>;
  }

  if (products.length === 0) {
    return <div className="empty-state">Nenhum produto encontrado</div>;
  }

  return (
    <div className="products-table-wrapper">
      <table className="products-table">
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Cor</th>
            <th>Qualidade</th>
            <th>Valor</th>
            <th>Quantidade</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const cartItem = cart.get(product.id);
            const quantity = cartItem?.quantity || 0;
            const subtotal = quantity * product.price;

            return (
              <tr key={product.id}>
                <td className="product-name">{product.description}</td>
                <td>{product.color || '-'}</td>
                <td>{product.category || '-'}</td>
                <td className="product-price">{formatCurrency(product.price)}</td>
                <td>
                  <QuantityInput
                    quantity={quantity}
                    onChange={(delta) => onQuantityChange(product, delta)}
                  />
                </td>
                <td className="product-subtotal">
                  {quantity > 0 ? formatCurrency(subtotal) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Cart Summary Component
function CartSummary({
  cart,
  storeName,
  onClear
}: {
  cart: Map<string, CartItem>;
  storeName: string;
  onClear: () => void;
}) {
  const items = Array.from(cart.values());
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  if (totalItems === 0) return null;

  const handleSendWhatsApp = () => {
    openWhatsApp(items, storeName);
  };

  return (
    <div className="cart-summary">
      <div className="cart-info">
        <div className="cart-total">
          <span className="cart-total-label">Total do Orçamento</span>
          <span className="cart-total-value">{formatCurrency(totalValue)}</span>
        </div>
        <span className="cart-items-count">{totalItems} item(ns)</span>
      </div>
      <div className="cart-actions">
        <button className="btn btn-secondary" onClick={onClear}>
          Limpar
        </button>
        <button className="btn btn-whatsapp" onClick={handleSendWhatsApp}>
          📱 Enviar WhatsApp
        </button>
      </div>
    </div>
  );
}

// Catalog Page Component
function CatalogPage({ store }: { store: Store }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Filters>({ groups: [], brands: [], categories: [], colors: [] });
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<{
    group: number | null;
    brand: number | null;
    category: number | null;
    color: number | null;
  }>({ group: null, brand: null, category: null, color: null });

  // Load filters
  useEffect(() => {
    api.getFilters(store.id).then(setFilters).catch(console.error);
  }, [store.id]);

  // Load products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getProducts(store.id, {
        group: activeFilters.group || undefined,
        brand: activeFilters.brand || undefined,
        category: activeFilters.category || undefined,
        color: activeFilters.color || undefined,
        search: search || undefined,
      });
      setProducts(data.products);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }, [store.id, activeFilters, search]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch !== search) return;
    loadProducts();
  }, [debouncedSearch]);

  const handleQuantityChange = (product: Product, delta: number) => {
    setCart((prev) => {
      const newCart = new Map(prev);
      const existing = newCart.get(product.id);
      const newQuantity = (existing?.quantity || 0) + delta;

      if (newQuantity <= 0) {
        newCart.delete(product.id);
      } else {
        newCart.set(product.id, { product, quantity: newQuantity });
      }

      return newCart;
    });
  };

  const handleFilterChange = (type: keyof typeof activeFilters, value: number | null) => {
    setActiveFilters((prev) => ({ ...prev, [type]: value }));
  };

  const handleClearCart = () => {
    setCart(new Map());
  };

  return (
    <>
      <Header storeName={store.name} />
      <div className="container">
        <div className="section-header">
          <h2>Tabela de Produtos</h2>
          <div className="search-box">
            <input
              type="text"
              placeholder="Pesquisar por modelo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="filters-section">
          <FilterChips
            label="Marcas"
            items={filters.brands}
            activeId={activeFilters.brand}
            onSelect={(id) => handleFilterChange('brand', id)}
          />
          <FilterChips
            label="Qualidade"
            items={filters.categories}
            activeId={activeFilters.category}
            onSelect={(id) => handleFilterChange('category', id)}
          />
          <FilterChips
            label="Grupos"
            items={filters.groups}
            activeId={activeFilters.group}
            onSelect={(id) => handleFilterChange('group', id)}
          />
          <FilterChips
            label="Cores"
            items={filters.colors}
            activeId={activeFilters.color}
            onSelect={(id) => handleFilterChange('color', id)}
          />
        </div>

        <ProductTable
          products={products}
          cart={cart}
          onQuantityChange={handleQuantityChange}
          loading={loading}
        />
      </div>

      <CartSummary cart={cart} storeName={store.name} onClear={handleClearCart} />
    </>
  );
}

// Main App
function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('App mounted, fetching stores...');
    api.getStores()
      .then((data) => {
        console.log('Stores loaded:', data);
        setStores(data);
        setError(null);
        // Selecionar automaticamente a loja CENTER PEÇAS - CATALÃO (ID 1)
        const defaultStore = data.find(s => s.id === 1);
        if (defaultStore) {
          setSelectedStore(defaultStore);
        }
      })
      .catch((err) => {
        console.error('Error loading stores:', err);
        setError(err.message || 'Erro ao carregar lojas');
      })
      .finally(() => {
        console.log('Loading complete');
        setLoading(false);
      });
  }, []);

  if (selectedStore) {
    return <CatalogPage store={selectedStore} />;
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="store-select-page">
          <div className="empty-state">
            <p>❌ {error}</p>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <StoreSelectPage stores={stores} onSelect={setSelectedStore} loading={loading} />
    </>
  );
}

export default App;
