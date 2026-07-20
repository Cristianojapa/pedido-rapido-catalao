import { useEffect, useState } from 'react';
import { api } from './api';
import type { CartItem, Filters, Product, Store } from './types';
import { formatCurrency } from './whatsapp';

interface ProductBrowserProps {
  store: Store;
  cart: Map<string, CartItem>;
  onQuantityChange: (product: Product, delta: number) => void;
  title?: string;
  description?: string;
  disabled?: boolean;
}

interface ActiveFilters {
  group: number | null;
  brand: number | null;
  category: number | null;
  color: number | null;
}

function FilterChips({
  label,
  items,
  activeId,
  onSelect,
  disabled,
}: {
  label: string;
  items: { id: number; name: string }[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
  disabled: boolean;
}) {
  if (!items.length) return null;

  return (
    <div className="filter-group">
      <span className="filter-label">{label}</span>
      <div className="filter-chips" role="group" aria-label={`Filtrar por ${label}`}>
        <button
          className={`chip ${activeId === null ? 'active' : ''}`}
          type="button"
          disabled={disabled}
          aria-pressed={activeId === null}
          onClick={() => onSelect(null)}
        >
          Todos
        </button>
        {items.map((item) => (
          <button
            className={`chip ${activeId === item.id ? 'active' : ''}`}
            key={item.id}
            type="button"
            disabled={disabled}
            aria-pressed={activeId === item.id}
            onClick={() => onSelect(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuantityInput({
  quantity,
  onChange,
  disabled,
  maxQuantity,
}: {
  quantity: number;
  onChange: (delta: number) => void;
  disabled: boolean;
  maxQuantity: number;
}) {
  return (
    <div className="quantity-input" aria-label={`Quantidade atual: ${quantity}`}>
      <button type="button" disabled={disabled || quantity === 0} onClick={() => onChange(-1)} aria-label="Diminuir quantidade">
        −
      </button>
      <span>{quantity}</span>
      <button type="button" disabled={disabled || quantity >= maxQuantity} onClick={() => onChange(1)} aria-label="Aumentar quantidade">
        +
      </button>
    </div>
  );
}

export function ProductTable({
  products,
  cart,
  onQuantityChange,
  loading,
  disabled = false,
}: {
  products: Product[];
  cart: Map<string, CartItem>;
  onQuantityChange: (product: Product, delta: number) => void;
  loading: boolean;
  disabled?: boolean;
}) {
  if (loading) return <div className="loading-row">Carregando produtos...</div>;
  if (!products.length) return <div className="empty-state">Nenhum produto encontrado.</div>;

  return (
    <div className="table-scroll product-table-scroll">
      <table className="data-table products-table">
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Cor</th>
            <th>Qualidade</th>
            <th>Estoque</th>
            <th>Valor</th>
            <th>Quantidade</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const quantity = cart.get(product.id)?.quantity || 0;
            const stockQuantity = product.stock_quantity;
            const hasStockQuantity = typeof stockQuantity === 'number';
            return (
              <tr className={quantity ? 'selected-row' : ''} key={product.id}>
                <td className="product-name" data-label="Modelo">{product.description}</td>
                <td data-label="Cor">{product.color || '—'}</td>
                <td data-label="Qualidade">{product.category || '—'}</td>
                <td className="stock-cell" data-label="Estoque">
                  <span className={'stock-badge' + (hasStockQuantity && stockQuantity <= 3 ? ' low' : '')}>
                    {hasStockQuantity ? `${stockQuantity} un.` : 'Carregando...'}
                  </span>
                </td>
                <td className="number-cell" data-label="Valor">{formatCurrency(product.price)}</td>
                <td className="quantity-cell" data-label="Quantidade">
                  <QuantityInput
                    quantity={quantity}
                    maxQuantity={stockQuantity ?? 0}
                    disabled={disabled || !hasStockQuantity}
                    onChange={(delta) => onQuantityChange(product, delta)}
                  />
                </td>
                <td className="number-cell" data-label="Subtotal">
                  {quantity ? formatCurrency(quantity * product.price) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ProductBrowser({
  store,
  cart,
  onQuantityChange,
  title = 'Tabela de produtos',
  description,
  disabled = false,
}: ProductBrowserProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Filters>({ groups: [], brands: [], categories: [], colors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    group: null,
    brand: null,
    category: null,
    color: null,
  });

  useEffect(() => {
    let active = true;
    api.getFilters(store.id).then((data) => {
      if (active) setFilters(data);
    }).catch(() => {
      if (active) setFilters({ groups: [], brands: [], categories: [], colors: [] });
    });
    return () => {
      active = false;
    };
  }, [store.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = search.trim();
      if (nextSearch === debouncedSearch) return;
      setLoading(true);
      setError(null);
      setDebouncedSearch(nextSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [debouncedSearch, search]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.getProducts(store.id, {
        group: activeFilters.group || undefined,
        brand: activeFilters.brand || undefined,
        category: activeFilters.category || undefined,
        color: activeFilters.color || undefined,
        search: debouncedSearch || undefined,
      }),
      api.getEmployeeStockLevels(store.id),
    ])
      .then(([data, stockLevels]) => {
        if (active) {
          setProducts(
            data.products.map((product) => ({
              ...product,
              stock_quantity: stockLevels[String(product.id)],
            })),
          );
        }
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeFilters, debouncedSearch, store.id]);

  const setFilter = (key: keyof ActiveFilters, value: number | null) => {
    setLoading(true);
    setError(null);
    setActiveFilters((current) => ({ ...current, [key]: value }));
  };

  const activeFilterCount = Object.values(activeFilters).filter((value) => value !== null).length;

  const clearFilters = () => {
    setLoading(true);
    setError(null);
    setActiveFilters({ group: null, brand: null, category: null, color: null });
  };

  return (
    <section className="product-browser" aria-labelledby="product-browser-title" aria-busy={loading}>
      <div className="section-heading product-heading">
        <div>
          <h2 id="product-browser-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <label className="search-field">
          <span className="sr-only">Pesquisar produto</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
          </svg>
          <input
            type="search"
            placeholder="Pesquisar por modelo..."
            value={search}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="filter-toolbar">
        <div>
          <strong>Filtros</strong>
          <span>{activeFilterCount ? activeFilterCount + ' ativo(s)' : 'Refine a lista de peças'}</span>
        </div>
        <div className="filter-toolbar-actions">
          {activeFilterCount > 0 && (
            <button className="text-button clear-filter-button" type="button" disabled={disabled} onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
          <button
            className="button secondary filter-toggle"
            type="button"
            disabled={disabled}
            aria-expanded={showAdvancedFilters}
            onClick={() => setShowAdvancedFilters((current) => !current)}
          >
            {showAdvancedFilters ? 'Menos filtros' : 'Mais filtros'}
          </button>
        </div>
      </div>

      <div className={'filters-section employee-filters' + (showAdvancedFilters ? ' advanced' : '')}>
        <FilterChips
          label="Grupos"
          items={filters.groups}
          activeId={activeFilters.group}
          onSelect={(id) => setFilter('group', id)}
          disabled={disabled}
        />
        <FilterChips
          label="Marcas"
          items={filters.brands}
          activeId={activeFilters.brand}
          onSelect={(id) => setFilter('brand', id)}
          disabled={disabled}
        />
        {showAdvancedFilters && (
          <>
            <FilterChips
              label="Qualidade"
              items={filters.categories}
              activeId={activeFilters.category}
              onSelect={(id) => setFilter('category', id)}
              disabled={disabled}
            />
            <FilterChips
              label="Cores"
              items={filters.colors}
              activeId={activeFilters.color}
              onSelect={(id) => setFilter('color', id)}
              disabled={disabled}
            />
          </>
        )}
      </div>

      {error ? <div className="inline-alert error">{error}</div> : (
        <ProductTable
          products={products}
          cart={cart}
          onQuantityChange={onQuantityChange}
          loading={loading}
          disabled={disabled}
        />
      )}
    </section>
  );
}
