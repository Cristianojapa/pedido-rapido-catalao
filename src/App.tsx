import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './index.css';
import { api } from './api';
import type { Store, Product, Filters, CartItem } from './types';
import { formatCurrency, openWhatsApp } from './whatsapp';
import type { CustomerPortalUser } from './customerAuth';
import { getSavedUser, clearAuth } from './customerAuth';
import CustomerLogin from './CustomerLogin';
import CustomerStatement from './CustomerStatement';

type Page = 'catalog' | 'login' | 'statement';

// Header Component
function Header({ storeName, user, onLoginClick, onStatementClick, onLogout, onLogoClick }: {
  storeName?: string;
  user: CustomerPortalUser | null;
  onLoginClick: () => void;
  onStatementClick: () => void;
  onLogout: () => void;
  onLogoClick: () => void;
}) {
  return (
    <header className="header">
      <div className="header-brand" onClick={onLogoClick} style={{ cursor: 'pointer' }}>
        <img src="/icons/Logo Center Cell.jpeg" alt="Center Peças" className="logo" />
        <h1>Center Peças</h1>
      </div>
      <div className="header-actions">
        {storeName && (
          <div className="store-location">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>{storeName.replace('CENTER PEÇAS - ', '')}</span>
          </div>
        )}
        <div className="header-auth">
          {user ? (
            <>
              <button className="btn-header-action" onClick={onStatementClick} title="Meu Extrato">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span className="hide-mobile">Extrato</span>
              </button>
              <div className="user-menu">
                <span className="user-name hide-mobile">👤 {user.name.split(' ')[0]}</span>
                <button className="btn-header-action btn-logout" onClick={onLogout} title="Sair">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span className="hide-mobile">Sair</span>
                </button>
              </div>
            </>
          ) : (
            <button className="btn-header-action btn-login-header" onClick={onLoginClick}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              <span>Entrar</span>
            </button>
          )}
        </div>
      </div>
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
  onClear,
  loggedInUser
}: {
  cart: Map<string, CartItem>;
  storeName: string;
  storeId: number;
  onClear: () => void;
  loggedInUser: CustomerPortalUser | null;
}) {
  const [sending, setSending] = useState(false);
  const [customerName, setCustomerName] = useState(() => {
    // If logged in, use the user's name
    if (loggedInUser) return loggedInUser.name;
    return localStorage.getItem('pedido_rapido_customer_name') || '';
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [showError, setShowError] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const items = Array.from(cart.values());
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  // Update name when user logs in/out
  useEffect(() => {
    if (loggedInUser) {
      setCustomerName(loggedInUser.name);
    }
  }, [loggedInUser]);

  if (totalItems === 0) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomerName(value);
    if (value.trim()) setShowError(false);
    localStorage.setItem('pedido_rapido_customer_name', value);
  };

  const handleSendWhatsApp = async () => {
    if (sending) return;

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setShowError(true);
      setIsExpanded(true); // Abre a gaveta se estiver no mobile
      setTimeout(() => nameInputRef.current?.focus(), 100);
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
            ref={nameInputRef}
            type="text"
            placeholder="Seu nome *"
            value={customerName}
            onChange={handleNameChange}
            className={`customer-name-input ${showError ? 'input-error' : ''}`}
            disabled={sending || !!loggedInUser}
            readOnly={!!loggedInUser}
          />
          {loggedInUser && <span className="logged-in-badge">✓ Logado</span>}
          {showError && <span className="error-text">O nome é obrigatório para enviar o pedido.</span>}
        </div>

        <div className="cart-actions-group">
          <span className="cart-final-price hide-mobile">{formatCurrency(totalValue)}</span>
          <button className="btn btn-secondary btn-clear" onClick={onClear} disabled={sending}>
            <span className="hide-mobile">Limpar 🗑️</span>
            <span className="hide-desktop">Limpar Orçamento</span>
          </button>
          <button
            className="btn btn-finish"
            onClick={handleSendWhatsApp}
            disabled={sending}
          >
            {sending ? '⏳...' : 'Finalizar Orçamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Catalog Page Component
function CatalogPage({ store, user }: { store: Store; user: CustomerPortalUser | null }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Filters>({ groups: [], brands: [], categories: [], colors: [] });
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [search, setSearch] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
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

  const cartItemsArray = useMemo(() => Array.from(cart.values()), [cart]);

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

        <div className="table-controls" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem', padding: '0 1rem' }}>
          <button
            className={`btn-selected-filter ${showSelectedOnly ? 'active' : ''}`}
            onClick={() => setShowSelectedOnly(!showSelectedOnly)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            Selecionados
            <span className="selected-badge">{cartItemsArray.length}</span>
          </button>
        </div>

        <ProductTable
          products={showSelectedOnly ? cartItemsArray.map(item => item.product) : products}
          cart={cart}
          onQuantityChange={handleQuantityChange}
          loading={loading && !showSelectedOnly}
        />
      </div>

      <CartSummary cart={cart} storeName={store.name} storeId={store.id} onClear={handleClearCart} loggedInUser={user} />
    </>
  );
}

// Main App
function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('catalog');
  const [portalUser, setPortalUser] = useState<CustomerPortalUser | null>(() => getSavedUser());

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

  const handleLoginSuccess = (user: CustomerPortalUser) => {
    setPortalUser(user);
    setCurrentPage('catalog');
  };

  const handleLogout = () => {
    clearAuth();
    setPortalUser(null);
    setCurrentPage('catalog');
  };

  const handleLogoClick = () => {
    setCurrentPage('catalog');
  };

  // Login Page
  if (currentPage === 'login') {
    return (
      <>
        <Header
          storeName={selectedStore?.name}
          user={portalUser}
          onLoginClick={() => setCurrentPage('login')}
          onStatementClick={() => setCurrentPage('statement')}
          onLogout={handleLogout}
          onLogoClick={handleLogoClick}
        />
        <CustomerLogin
          onLoginSuccess={handleLoginSuccess}
          onBack={() => setCurrentPage('catalog')}
        />
      </>
    );
  }

  // Statement Page
  if (currentPage === 'statement') {
    return (
      <>
        <Header
          storeName={selectedStore?.name}
          user={portalUser}
          onLoginClick={() => setCurrentPage('login')}
          onStatementClick={() => setCurrentPage('statement')}
          onLogout={handleLogout}
          onLogoClick={handleLogoClick}
        />
        <CustomerStatement onBack={() => setCurrentPage('catalog')} />
      </>
    );
  }

  // Catalog
  if (selectedStore) {
    return (
      <>
        <Header
          storeName={selectedStore.name}
          user={portalUser}
          onLoginClick={() => setCurrentPage('login')}
          onStatementClick={() => setCurrentPage('statement')}
          onLogout={handleLogout}
          onLogoClick={handleLogoClick}
        />
        <CatalogPage store={selectedStore} user={portalUser} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header
          user={portalUser}
          onLoginClick={() => setCurrentPage('login')}
          onStatementClick={() => setCurrentPage('statement')}
          onLogout={handleLogout}
          onLogoClick={handleLogoClick}
        />
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
      <Header
        user={portalUser}
        onLoginClick={() => setCurrentPage('login')}
        onStatementClick={() => setCurrentPage('statement')}
        onLogout={handleLogout}
        onLogoClick={handleLogoClick}
      />
      <StoreSelectPage stores={stores} onSelect={setSelectedStore} loading={loading} />
    </>
  );
}

export default App;
