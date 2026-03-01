import { useState, useEffect, useCallback, useMemo } from 'react';
import './index.css';
import { api } from './api';
import type { Store, Product, Filters, CartItem } from './types';
import { formatCurrency, openWhatsApp } from './whatsapp';

// Header Component
function Header({ storeName }: { storeName?: string }) {
  return (
    <header className="header">
      <div className="header-brand">
        <span className="logo">PR</span>
        <h1>Pedido Rápido</h1>
      </div>
      {storeName && (
        <div className="store-badge">
          📍 {storeName}
        </div>
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
      <h2>Bem-vindo ao Pedido Rápido!</h2>
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

// Função para padronizar nomes (primeira letra de cada palavra maiúscula)
function formatName(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Ordem preferida dos grupos (TELA primeiro)
const GROUP_ORDER: Record<string, number> = {
  'TELA': 0,
  'BATERIA': 1,
  'TAMPA E LENTE': 2,
  'FLEX E PLACA': 3,
  'CABO E CARREGADOR': 4,
  'PELICULA': 5,
  'CONSUMIVEL': 6,
  'FERRAMENTAS': 7,
};

// Filter Chips Component - Estilo Moderno
function FilterChips({
  label,
  items,
  activeId,
  onSelect,
  onClear,
  showClear = false
}: {
  label: string;
  items: { id: number; name: string }[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
  onClear?: () => void;
  showClear?: boolean;
}) {
  if (items.length === 0) return null;

  const selectedCount = activeId !== null ? 1 : 0;

  return (
    <div className="filter-group">
      <div className="filter-header">
        <span className="filter-label">
          {label}
          {selectedCount > 0 && <span className="filter-count">{selectedCount}</span>}
        </span>
        {showClear && activeId !== null && (
          <button className="filter-clear" onClick={onClear}>
            Limpar
          </button>
        )}
      </div>
      <div className="filter-chips">
        {items.map((item) => (
          <button
            key={item.id}
            className={`chip ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(activeId === item.id ? null : item.id)}
          >
            {formatName(item.name)}
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
            <th>Valor</th>
            <th>Qtd</th>
            <th className="hide-mobile">Subtotal</th>
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
                <td className="product-price">{formatCurrency(product.price)}</td>
                <td className="quantity-cell">
                  <QuantityInput
                    quantity={quantity}
                    onChange={(delta) => onQuantityChange(product, delta)}
                  />
                  {quantity > 0 && (
                    <div className="mobile-subtotal">
                      {formatCurrency(subtotal)}
                    </div>
                  )}
                </td>
                <td className="product-subtotal hide-mobile">
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
  storeId,
  onClear
}: {
  cart: Map<string, CartItem>;
  storeName: string;
  storeId: number;
  onClear: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [customerName, setCustomerName] = useState(() => {
    return localStorage.getItem('pedido_rapido_customer_name') || '';
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const items = Array.from(cart.values());
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  if (totalItems === 0) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomerName(value);
    localStorage.setItem('pedido_rapido_customer_name', value);
  };

  const handleSendWhatsApp = async () => {
    if (sending) return;

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      alert('Por favor, informe seu nome antes de enviar o pedido.');
      return;
    }

    setSending(true);
    try {
      const result = await openWhatsApp(items, storeName, storeId, trimmedName);

      if (result.success) {
        console.log('Pedido #' + result.orderId + ' criado com sucesso!');
        onClear();
      } else if (result.error) {
        console.warn('Pedido enviado para WhatsApp mas não foi salvo no sistema:', result.error);
      }
    } catch (error) {
      console.error('Erro ao enviar pedido:', error);
      alert('Erro ao enviar pedido. Por favor, tente novamente.');
    }
  };

  return (
    <div className={`cart-summary ${isExpanded ? 'expanded' : ''}`}>
      {/* Mobile Top Bar (Header) - Toggle logic */}
      <div
        className="cart-mobile-header hide-desktop"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="cart-total-titles">
          <span className="cart-total-heading">Total do Orçamento</span>
          <span className="cart-total-subtitle">{totalItems} item(ns)</span>
        </div>
        <div className="cart-mobile-header-right">
          <span className="cart-final-price">{formatCurrency(totalValue)}</span>
          <svg className={`chevron-icon ${isExpanded ? 'up' : 'down'}`} viewBox="0 0 24 24" width="24" height="24">
            <path d="M7 10l5 5 5-5" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div className="cart-summary-inner">
        {/* Desktop Info Group */}
        <div className="cart-info-group hide-mobile">
          <div className="cart-total-titles">
            <span className="cart-total-heading">Total do Orçamento</span>
            <span className="cart-total-subtitle">{totalItems} item(ns)</span>
          </div>
        </div>

        <div className="cart-customer">
          <input
            type="text"
            placeholder="Seu nome *"
            value={customerName}
            onChange={handleNameChange}
            className="customer-name-input"
            disabled={sending}
          />
        </div>

        <div className="cart-actions-group">
          <span className="cart-final-price hide-mobile">{formatCurrency(totalValue)}</span>
          <button className="btn btn-secondary btn-clear" onClick={onClear} disabled={sending}>
            <span className="hide-mobile">Limpar 🗑️</span>
            <span className="show-mobile-inline">Limpar Orçamento</span>
          </button>
          <button
            className="btn btn-finish"
            onClick={handleSendWhatsApp}
            disabled={sending || !customerName.trim()}
          >
            {sending ? '⏳...' : 'Finalizar Orçamento'}
          </button>
        </div>
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

  // Load initial filters (all groups)
  useEffect(() => {
    api.getFilters(store.id, {}).then(setFilters).catch(console.error);
  }, [store.id]);

  // Ordenar grupos (TELA primeiro)
  const sortedGroups = useMemo(() => {
    return [...filters.groups].sort((a, b) => {
      const orderA = GROUP_ORDER[a.name.toUpperCase()] ?? 999;
      const orderB = GROUP_ORDER[b.name.toUpperCase()] ?? 999;
      return orderA - orderB;
    });
  }, [filters.groups]);

  // Load filtered secondary filters when any filter changes
  useEffect(() => {
    if (activeFilters.group !== null) {
      api.getFilters(store.id, {
        group: activeFilters.group,
        brand: activeFilters.brand || undefined,
        category: activeFilters.category || undefined,
      })
        .then((filteredFilters) => {
          setFilters((prev) => ({
            ...prev,
            brands: filteredFilters.brands,
            categories: filteredFilters.categories,
            colors: filteredFilters.colors,
          }));
        })
        .catch(console.error);
    }
  }, [store.id, activeFilters.group, activeFilters.brand, activeFilters.category]);

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
    if (type === 'group') {
      setActiveFilters({ group: value, brand: null, category: null, color: null });
    } else {
      setActiveFilters((prev) => ({ ...prev, [type]: value }));
    }
  };

  const handleClearCart = () => {
    setCart(new Map());
  };

  return (
    <>
      <Header storeName={store.name} />
      <div className="container">
        <div className="page-title">
          <h2>Catálogo de Produtos</h2>
          <p>Selecione os produtos e quantidades para seu orçamento</p>
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder="Pesquisar por modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filters-section">
          {/* Filtro principal: Grupos (ordenado, TELA primeiro) */}
          <FilterChips
            label="Grupo"
            items={sortedGroups}
            activeId={activeFilters.group}
            onSelect={(id) => handleFilterChange('group', id)}
            showClear={true}
            onClear={() => handleFilterChange('group', null)}
          />

          {/* Filtros secundários: só aparecem após selecionar um grupo */}
          {activeFilters.group !== null && (
            <>
              <FilterChips
                label="Marcas"
                items={filters.brands}
                activeId={activeFilters.brand}
                onSelect={(id) => handleFilterChange('brand', id)}
                showClear={true}
                onClear={() => handleFilterChange('brand', null)}
              />
              <FilterChips
                label="Qualidade"
                items={filters.categories}
                activeId={activeFilters.category}
                onSelect={(id) => handleFilterChange('category', id)}
                showClear={true}
                onClear={() => handleFilterChange('category', null)}
              />
              <FilterChips
                label="Cores"
                items={filters.colors}
                activeId={activeFilters.color}
                onSelect={(id) => handleFilterChange('color', id)}
                showClear={true}
                onClear={() => handleFilterChange('color', null)}
              />
            </>
          )}
        </div>

        <ProductTable
          products={products}
          cart={cart}
          onQuantityChange={handleQuantityChange}
          loading={loading}
        />
      </div>

      <CartSummary cart={cart} storeName={store.name} storeId={store.id} onClear={handleClearCart} />
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
    api.getStores()
      .then((data) => {
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
