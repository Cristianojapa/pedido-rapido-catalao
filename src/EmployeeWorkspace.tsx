import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, createClientRequestId } from './api';
import ProductBrowser from './ProductBrowser';
import type {
  Bank,
  CartItem,
  Customer,
  DeliveryMethod,
  EligibleCancellationOrder,
  EligiblePurchaseItem,
  EmployeeUser,
  OperationalRequest,
  PaymentMethod,
  Product,
  Store,
  WarrantySelection,
} from './types';
import { formatCurrency } from './whatsapp';

type WorkspaceTab = 'sale' | 'warranty' | 'requests' | 'return' | 'cancellation';

interface DraftState {
  dirty: boolean;
  submitting: boolean;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'DEBIT_CARD', label: 'Cartão de débito' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'PENDING', label: 'Pendente' },
];

const DELIVERY_METHODS: { value: DeliveryMethod; label: string }[] = [
  { value: 'CUSTOMER_PICKUP', label: 'Cliente retira na loja' },
  { value: 'MOTOBOY', label: 'Entregar por motoboy' },
];

const REQUEST_TYPE_LABELS: Record<string, string> = {
  SALE: 'Venda',
  WARRANTY_EXCHANGE: 'Garantia / Troca',
  RETURN: 'Devolução',
  CANCELLATION: 'Cancelamento',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Novo',
  PENDING: 'Novo',
  IN_REVIEW: 'Em análise',
  IN_SEPARATION: 'Em separação',
  IN_PROGRESS: 'Em andamento',
  SEPARATING: 'Em separação',
  READY_FOR_DELIVERY: 'Pronto para entrega',
  AWAITING_DEFECTIVE: 'Aguardando estoque receber a peça com defeito',
  PROCESSING: 'Em andamento',
  READY: 'Pronto',
  COMPLETED: 'Concluído',
  CONVERTED: 'Concluído',
  CANCELLED: 'Cancelado',
  NEEDS_INFO: 'Com pendência',
  BLOCKED: 'Com pendência',
};

const REQUEST_TYPE_FILTER_OPTIONS = [
  { value: 'SALE', label: 'Venda' },
  { value: 'WARRANTY_EXCHANGE', label: 'Garantia / Troca' },
  { value: 'RETURN', label: 'Devolução' },
  { value: 'CANCELLATION', label: 'Cancelamento' },
];

const REQUEST_STATUS_FILTER_OPTIONS = [
  { value: 'NEW', label: 'Novo' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'SEPARATING', label: 'Em separação' },
  { value: 'READY_FOR_DELIVERY', label: 'Pronto para entrega' },
  { value: 'AWAITING_DEFECTIVE', label: 'Aguardando peça com defeito' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'BLOCKED', label: 'Com pendência' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

const REQUESTS_LIVE_REFRESH_INTERVAL_MS = 3_000;

function employeeName(user: EmployeeUser): string {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return fullName || user.email;
}

function requestTypeLabel(request: OperationalRequest): string {
  return request.type_display || REQUEST_TYPE_LABELS[request.type] || request.type;
}

function requestStatusLabel(request: OperationalRequest): string {
  return request.status_display || STATUS_LABELS[request.status] || request.status;
}

function requestStatusReason(value?: string | null): string {
  const raw = value?.trim();
  if (!raw) return '';
  const extracted = Array.from(
    raw.matchAll(/ErrorDetail\(string=(['"])(.*?)\1,\s*code=(['"])(.*?)\3\)/g),
    (match) => match[2],
  );
  if (extracted.length) return [...new Set(extracted)].join(' ');
  return raw;
}

function requestCreatorId(request: OperationalRequest): string {
  const value = request.submitted_by ?? request.seller;
  return value === null || value === undefined ? '' : String(value);
}

function requestCreatorName(request: OperationalRequest): string {
  return request.submitted_by_name || request.seller_name || 'Vendedor não identificado';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    'pt-BR',
    dateOnly ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' },
  ).format(date);
}

function CustomerPicker({
  store,
  selected,
  onSelect,
  disabled = false,
}: {
  store: Store;
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState(selected?.name || '');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let requestActive = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      api.getCustomers(store.id, search)
        .then((data) => {
          if (requestActive) setCustomers(data);
        })
        .catch((requestError: Error) => {
          if (requestActive) setError(requestError.message);
        })
        .finally(() => {
          if (requestActive) setLoading(false);
        });
    }, 250);
    return () => {
      requestActive = false;
      window.clearTimeout(timer);
    };
  }, [search, store.id]);


  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const options = selected && !customers.some((customer) => String(customer.id) === String(selected.id))
    ? [selected, ...customers]
    : customers;

  const selectCustomer = (customer: Customer) => {
    setSearch('');
    setOpen(false);
    setActiveIndex(-1);
    onSelect(customer);
  };

  const clearCustomer = () => {
    setSearch('');
    setOpen(true);
    setActiveIndex(-1);
    onSelect(null);
  };

  return (
    <div className="customer-picker" ref={pickerRef}>
      <label className="field" htmlFor="customer-search">
        <span>Cliente</span>
        <div className="customer-combobox-control">
          <span className="customer-search-icon" aria-hidden="true">⌕</span>
          <input
            id="customer-search"
            type="search"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="customer-options"
            aria-expanded={open}
            aria-activedescendant={activeIndex >= 0 ? `customer-option-${options[activeIndex]?.id}` : undefined}
            placeholder="Digite nome, telefone ou documento"
            value={selected ? selected.name : search}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
              setOpen(true);
              setActiveIndex(-1);
              if (selected && value !== selected.name) {
                onSelect(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => Math.min(current + 1, options.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === 'Enter' && open && activeIndex >= 0 && options[activeIndex]) {
                event.preventDefault();
                selectCustomer(options[activeIndex]);
              } else if (event.key === 'Escape') {
                setOpen(false);
                setActiveIndex(-1);
              }
            }}
          />
          {loading ? (
            <span className="customer-search-status" aria-label="Buscando clientes">Buscando...</span>
          ) : (search || selected) ? (
            <button type="button" className="customer-search-clear" onClick={clearCustomer} aria-label="Limpar cliente">×</button>
          ) : null}
        </div>
      </label>

      {open && !disabled && (
        <div id="customer-options" className="customer-options" role="listbox">
          {loading ? (
            <div className="customer-option-message">Buscando clientes...</div>
          ) : options.length ? options.map((customer, index) => (
            <button
              id={`customer-option-${customer.id}`}
              type="button"
              role="option"
              aria-selected={String(selected?.id) === String(customer.id)}
              className={`customer-option${index === activeIndex ? ' active' : ''}`}
              key={customer.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectCustomer(customer)}
            >
              <strong>{customer.name}</strong>
              <span>
                {[customer.phone, customer.document].filter(Boolean).join(' · ') || 'Sem telefone ou documento cadastrado'}
              </span>
            </button>
          )) : (
            <div className="customer-option-message">
              {search ? 'Nenhum cliente encontrado.' : 'Digite para localizar um cliente.'}
            </div>
          )}
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
function CartLines({
  cart,
  onRemove,
  disabled = false,
}: {
  cart: Map<string, CartItem>;
  onRemove: (productId: string) => void;
  disabled?: boolean;
}) {
  const items = Array.from(cart.values());
  if (!items.length) return <p className="muted-copy">Nenhuma peça adicionada.</p>;
  return (
    <div className="compact-lines">
      {items.map(({ product, quantity }) => (
        <div className="compact-line" key={product.id}>
          <div>
            <strong>{product.description}</strong>
            <span>{quantity} × {formatCurrency(product.price)}</span>
          </div>
          <button type="button" className="text-button danger-text" disabled={disabled} onClick={() => onRemove(product.id)}>
            Remover
          </button>
        </div>
      ))}
    </div>
  );
}

function SaleTab({
  store,
  active,
  onCreated,
  onDraftStateChange,
}: {
  store: Store;
  active: boolean;
  onCreated: () => void;
  onDraftStateChange: (state: DraftState) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('CUSTOMER_PICKUP');
  const [installments, setInstallments] = useState(1);
  const [bankId, setBankId] = useState('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [banksReloadKey, setBanksReloadKey] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setBanksLoading(true);
    setBanksError(null);
    api.getBanks()
      .then((data) => {
        if (mounted) setBanks(data);
      })
      .catch((error: Error) => {
        if (!mounted) return;
        setBanks([]);
        setBanksError(error.message);
      })
      .finally(() => {
        if (mounted) setBanksLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [banksReloadKey]);

  useEffect(() => {
    setCustomer(null);
    setCart(new Map());
    setPaymentMethod('');
    setDeliveryMethod('CUSTOMER_PICKUP');
    setInstallments(1);
    setBankId('');
    setNotes('');
    setFeedback(null);
    clientRequestIdRef.current = null;
  }, [store.id]);

  useEffect(() => {
    if (paymentMethod !== 'CREDIT_CARD') setInstallments(1);
    if (paymentMethod === 'PENDING') setBankId('');
  }, [paymentMethod]);

  const items = Array.from(cart.values());
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const needsBank = paymentMethod !== '' && paymentMethod !== 'PENDING';
  const dirty = Boolean(customer || cart.size || notes.trim());

  useEffect(() => {
    onDraftStateChange({ dirty, submitting });
  }, [dirty, onDraftStateChange, submitting]);

  const invalidateRequestId = () => {
    clientRequestIdRef.current = null;
    setFeedback(null);
  };

  const updateQuantity = (product: Product, delta: number) => {
    if (submitting) return;
    invalidateRequestId();
    setCart((current) => {
      const next = new Map(current);
      const quantity = (next.get(product.id)?.quantity || 0) + delta;
      if (quantity <= 0) next.delete(product.id);
      else next.set(product.id, { product, quantity });
      return next;
    });
  };

  const submit = async () => {
    setFeedback(null);
    if (!customer) {
      setFeedback({ kind: 'error', message: 'Selecione o cliente desta venda.' });
      return;
    }
    if (!items.length) {
      setFeedback({ kind: 'error', message: 'Adicione pelo menos uma peça.' });
      return;
    }
    if (!paymentMethod) {
      setFeedback({ kind: 'error', message: 'Selecione a forma de pagamento desta venda.' });
      return;
    }
    if (needsBank && !bankId) {
      setFeedback({ kind: 'error', message: 'Selecione o banco usado no pagamento.' });
      return;
    }

    setSubmitting(true);
    const clientRequestId = clientRequestIdRef.current || createClientRequestId();
    clientRequestIdRef.current = clientRequestId;
    try {
      const created = await api.createOperationalRequest({
        type: 'SALE',
        store: store.id,
        customer: customer.id,
        items: items.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
        delivery_method: deliveryMethod,
        payment_method: paymentMethod,
        number_of_installments: installments,
        bank: needsBank ? bankId : null,
        notes: notes.trim() || undefined,
      }, clientRequestId);
      setCart(new Map());
      setCustomer(null);
      setPaymentMethod('');
      setDeliveryMethod('CUSTOMER_PICKUP');
      setInstallments(1);
      setBankId('');
      setNotes('');
      clientRequestIdRef.current = null;
      setFeedback({ kind: 'success', message: `Venda #${created.id} enviada para a retaguarda.` });
      onCreated();
    } catch (error) {
      setFeedback({ kind: 'error', message: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="panel-sale"
      className="tab-panel tab-enter"
      role="tabpanel"
      aria-labelledby="tab-sale"
      hidden={!active}
    >
      <div className="workspace-intro">
        <div>
          <span className="eyebrow">Nova solicitação</span>
          <h1>Venda para cliente</h1>
          <p>Selecione o cliente, monte o pedido e envie os dados prontos para separação.</p>
        </div>
        <div className="workspace-context"><span>Loja</span><strong>{store.name}</strong></div>
      </div>

      <div className="operational-layout">
        <div className="operational-main">
          <section className="form-section">
            <div className="section-heading">
              <div><span className="step-number">01</span><h2>Cliente</h2></div>
              <p>Os clientes disponíveis são limitados à loja selecionada.</p>
            </div>
            <CustomerPicker
              store={store}
              selected={customer}
              disabled={submitting}
              onSelect={(nextCustomer) => {
                invalidateRequestId();
                setCustomer(nextCustomer);
              }}
            />
          </section>

          <ProductBrowser
            key={store.id}
            store={store}
            cart={cart}
            onQuantityChange={updateQuantity}
            title="02 · Peças da venda"
            description="Use os filtros ou pesquise pelo modelo."
            disabled={submitting}
          />
        </div>

        <aside className="request-inspector" aria-label="Resumo da venda">
          <div className="inspector-title">
            <div><span className="step-number">03</span><h2>Resumo</h2></div>
            <span>{totalQuantity} peça(s)</span>
          </div>
          <CartLines
            cart={cart}
            disabled={submitting}
            onRemove={(productId) => {
              invalidateRequestId();
              setCart((current) => {
                const next = new Map(current);
                next.delete(productId);
                return next;
              });
            }}
          />
          <div className="inspector-total"><span>Total estimado</span><strong>{formatCurrency(total)}</strong></div>

          <div className="field-stack">
            <label className="field">
              <span>Forma de pagamento</span>
              <select
                value={paymentMethod}
                disabled={submitting}
                onChange={(event) => {
                  invalidateRequestId();
                  setPaymentMethod(event.target.value as PaymentMethod | '');
                }}
              >
                <option value="">Selecione a forma de pagamento</option>
                {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select>
            </label>
            {paymentMethod === 'CREDIT_CARD' && (
              <label className="field">
                <span>Parcelas</span>
                <select
                  value={installments}
                  disabled={submitting}
                  onChange={(event) => {
                    invalidateRequestId();
                    setInstallments(Number(event.target.value));
                  }}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>{value}×</option>
                  ))}
                </select>
              </label>
            )}
            {needsBank && (
              <label className="field">
                <span>Banco</span>
                <select
                  value={bankId}
                  disabled={submitting || banksLoading || Boolean(banksError)}
                  onChange={(event) => {
                    invalidateRequestId();
                    setBankId(event.target.value);
                  }}
                >
                  <option value="">{banksLoading ? 'Carregando bancos...' : 'Selecione o banco'}</option>
                  {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                </select>
              </label>
            )}
            {needsBank && banksError && (
              <div className="inline-alert error" role="alert">
                <span>{banksError}</span>{' '}
                <button className="text-button" type="button" disabled={submitting} onClick={() => setBanksReloadKey((key) => key + 1)}>
                  Tentar novamente
                </button>
              </div>
            )}
            <label className="field">
              <span>Entrega</span>
              <select
                value={deliveryMethod}
                disabled={submitting}
                onChange={(event) => {
                  invalidateRequestId();
                  setDeliveryMethod(event.target.value as DeliveryMethod);
                }}
              >
                {DELIVERY_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>{method.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Observações <small>opcional</small></span>
              <textarea
                rows={3}
                value={notes}
                disabled={submitting}
                onChange={(event) => {
                  invalidateRequestId();
                  setNotes(event.target.value);
                }}
                placeholder="Informação para a retaguarda"
              />
            </label>
          </div>

          {feedback && <div className={`inline-alert ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</div>}
          <button className="button primary wide" type="button" disabled={submitting || (needsBank && (banksLoading || Boolean(banksError)))} onClick={submit}>
            {submitting ? 'Enviando...' : 'Enviar para separação'}
          </button>
          <p className="action-note">A venda só movimenta o estoque após a confirmação da retaguarda.</p>
        </aside>
      </div>
    </div>
  );
}

function WarrantyQuantity({
  selection,
  maximum,
  itemLabel,
  onChange,
  disabled = false,
}: {
  selection: WarrantySelection | undefined;
  maximum: number;
  itemLabel: string;
  onChange: (quantity: number) => void;
  disabled?: boolean;
}) {
  const quantity = selection?.quantity || 0;
  return (
    <div className="quantity-input">
      <button type="button" disabled={disabled} aria-label={`Diminuir quantidade de ${itemLabel}`} onClick={() => onChange(Math.max(0, quantity - 1))}>−</button>
      <span>{quantity}</span>
      <button type="button" disabled={disabled} aria-label={`Aumentar quantidade de ${itemLabel}`} onClick={() => onChange(Math.min(maximum, quantity + 1))}>+</button>
    </div>
  );
}

function WarrantyTab({
  store,
  active,
  onCreated,
  onDraftStateChange,
}: {
  store: Store;
  active: boolean;
  onCreated: () => void;
  onDraftStateChange: (state: DraftState) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<EligiblePurchaseItem[]>([]);
  const [selections, setSelections] = useState<Map<string, WarrantySelection>>(new Map());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    setCustomer(null);
    setPurchases([]);
    setSelections(new Map());
    setNotes('');
    setLoading(false);
    setFeedback(null);
    clientRequestIdRef.current = null;
  }, [store.id]);

  const dirty = Boolean(customer || selections.size || notes.trim());

  useEffect(() => {
    onDraftStateChange({ dirty, submitting });
  }, [dirty, onDraftStateChange, submitting]);

  useEffect(() => {
    if (!customer) {
      setPurchases([]);
      setSelections(new Map());
      return;
    }
    let requestActive = true;
    setPurchases([]);
    setSelections(new Map());
    clientRequestIdRef.current = null;
    setLoading(true);
    setFeedback(null);
    api.getEligiblePurchases(customer.id, store.id)
      .then((data) => {
        if (requestActive) setPurchases(data);
      })
      .catch((error: Error) => {
        if (requestActive) setFeedback({ kind: 'error', message: error.message });
      })
      .finally(() => {
        if (requestActive) setLoading(false);
      });
    return () => {
      requestActive = false;
    };
  }, [customer, store.id]);

  const updateSelection = (item: EligiblePurchaseItem, quantity: number, defect?: string) => {
    if (submitting) return;
    clientRequestIdRef.current = null;
    setFeedback(null);
    const key = item.eligibility_id;
    setSelections((current) => {
      const next = new Map(current);
      if (quantity <= 0) next.delete(key);
      else next.set(key, {
        item,
        quantity,
        defect_description: defect ?? current.get(key)?.defect_description ?? '',
      });
      return next;
    });
  };

  const selectedItems = Array.from(selections.values());

  const submit = async () => {
    setFeedback(null);
    if (!customer) {
      setFeedback({ kind: 'error', message: 'Selecione o cliente da garantia.' });
      return;
    }
    if (!selectedItems.length) {
      setFeedback({ kind: 'error', message: 'Selecione pelo menos uma peça comprada.' });
      return;
    }
    if (selectedItems.some((selection) => !selection.defect_description.trim())) {
      setFeedback({ kind: 'error', message: 'Informe o defeito de cada peça selecionada.' });
      return;
    }

    setSubmitting(true);
    const clientRequestId = clientRequestIdRef.current || createClientRequestId();
    clientRequestIdRef.current = clientRequestId;
    try {
      const created = await api.createOperationalRequest({
        type: 'WARRANTY_EXCHANGE',
        store: store.id,
        customer: customer.id,
        items: selectedItems.map(({ item, quantity, defect_description }) => ({
          product_id: item.product_id,
          source_order_item: item.source_order_item_id,
          source_warranty: item.source_warranty_id ?? undefined,
          quantity,
          defect: defect_description.trim(),
        })),
        notes: notes.trim() || undefined,
      }, clientRequestId);
      setSelections(new Map());
      setCustomer(null);
      setNotes('');
      clientRequestIdRef.current = null;
      setFeedback({ kind: 'success', message: `Garantia #${created.id} enviada para análise.` });
      onCreated();
    } catch (error) {
      setFeedback({ kind: 'error', message: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="panel-warranty"
      className="tab-panel tab-enter"
      role="tabpanel"
      aria-labelledby="tab-warranty"
      hidden={!active}
    >
      <div className="workspace-intro">
        <div>
          <span className="eyebrow warranty-color">Nova solicitação</span>
          <h1>Garantia / Troca</h1>
          <p>Escolha somente peças do histórico real de compras do cliente.</p>
        </div>
        <div className="workspace-context"><span>Loja</span><strong>{store.name}</strong></div>
      </div>

      <section className="form-section">
        <div className="section-heading">
          <div><span className="step-number">01</span><h2>Cliente</h2></div>
          <p>A lista de compras é carregada após selecionar o cliente.</p>
        </div>
        <CustomerPicker
          store={store}
          selected={customer}
          disabled={submitting}
          onSelect={(nextCustomer) => {
            setPurchases([]);
            setSelections(new Map());
            if (!nextCustomer) setLoading(false);
            setFeedback(null);
            clientRequestIdRef.current = null;
            setCustomer(nextCustomer);
          }}
        />
      </section>

      <section className="form-section warranty-purchases">
        <div className="section-heading">
          <div><span className="step-number">02</span><h2>Peças elegíveis</h2></div>
          <p>{selectedItems.length} item(ns) selecionado(s)</p>
        </div>
        {loading ? <div className="loading-row" aria-live="polite">Buscando histórico de compras...</div> : !customer ? (
          <div className="empty-state">Selecione um cliente para consultar as compras.</div>
        ) : !purchases.length ? (
          <div className="empty-state">Nenhuma peça elegível encontrada para este cliente.</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table warranty-table">
              <thead><tr><th>Origem</th><th>Data</th><th>Peça</th><th>Disponível</th><th>Quantidade</th><th>Defeito</th></tr></thead>
              <tbody>
                {purchases.map((item) => {
                  const key = item.eligibility_id;
                  const selection = selections.get(key);
                  return (
                    <tr className={selection ? 'selected-row' : ''} key={key}>
                      <td data-label="Origem" className="eligible-origin-cell">
                        <strong>{item.order_label}</strong>
                        {item.source_kind === 'WARRANTY_REPLACEMENT' && (
                          <>
                            <span className="replacement-origin-badge">
                              {item.next_warranty_generation}ª garantia
                            </span>
                            <small>Peça substituta da garantia anterior</small>
                          </>
                        )}
                      </td>
                      <td data-label="Data">{formatDate(item.order_date)}</td>
                      <td data-label="Peça"><strong>{item.description}</strong>{item.color && <small>{item.color}</small>}</td>
                      <td data-label="Disponível">{item.eligible_quantity} de {item.purchased_quantity}</td>
                      <td data-label="Quantidade">
                        <WarrantyQuantity
                          selection={selection}
                          maximum={item.eligible_quantity}
                          itemLabel={item.description}
                          disabled={submitting}
                          onChange={(quantity) => updateSelection(item, quantity)}
                        />
                      </td>
                      <td data-label="Defeito">
                        <input
                          className="table-input"
                          type="text"
                          value={selection?.defect_description || ''}
                          disabled={!selection || submitting}
                          placeholder={selection ? 'Descreva o defeito' : 'Selecione a quantidade'}
                          onChange={(event) => updateSelection(item, selection?.quantity || 1, event.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="form-footer">
        <label className="field grow-field">
          <span>Observações para a retaguarda <small>opcional</small></span>
          <input
            value={notes}
            disabled={submitting}
            onChange={(event) => {
              clientRequestIdRef.current = null;
              setFeedback(null);
              setNotes(event.target.value);
            }}
            placeholder="Ex.: cliente aguardando na loja"
          />
        </label>
        <div className="form-footer-action">
          {feedback && <div className={`inline-alert ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</div>}
          <button className="button primary" type="button" disabled={submitting || loading} onClick={submit}>
            {submitting ? 'Enviando...' : 'Enviar garantia para análise'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestsTab({
  refreshKey,
  active,
  store,
  user,
}: {
  refreshKey: number;
  active: boolean;
  store: Store;
  user: EmployeeUser;
}) {
  const [requests, setRequests] = useState<OperationalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sellerFilter, setSellerFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const loadSequence = useRef(0);
  const liveRefreshInFlight = useRef(false);
  const actionInFlight = useRef(false);

  const loadRequests = useCallback(async (silent = false) => {
    const sequence = ++loadSequence.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await api.getOperationalRequests(store.id);
      if (sequence !== loadSequence.current) return;
      setRequests(data);
      setError(null);
    } catch (requestError) {
      if (sequence !== loadSequence.current) return;
      setError((requestError as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [store.id]);

  useEffect(() => {
    setSellerFilter('ALL');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
  }, [store.id]);

  useEffect(() => {
    if (!active) {
      loadSequence.current += 1;
      return;
    }
    void loadRequests();

    const refreshLive = () => {
      if (
        document.visibilityState !== 'visible'
        || actionInFlight.current
        || liveRefreshInFlight.current
      ) {
        return;
      }

      liveRefreshInFlight.current = true;
      void loadRequests(true).finally(() => {
        liveRefreshInFlight.current = false;
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshLive();
    };

    const interval = window.setInterval(
      refreshLive,
      REQUESTS_LIVE_REFRESH_INTERVAL_MS,
    );
    window.addEventListener('focus', refreshLive);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      loadSequence.current += 1;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshLive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, loadRequests, refreshKey, reloadKey]);

  const sellerOptions = useMemo(() => {
    const sellers = new Map<string, string>();
    requests.forEach((request) => {
      const id = requestCreatorId(request);
      if (id) sellers.set(id, requestCreatorName(request));
    });
    return Array.from(sellers, ([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [requests]);

  const isMyRequest = useCallback(
    (request: OperationalRequest) => requestCreatorId(request) === String(user.id),
    [user.id],
  );

  const visibleRequests = useMemo(() => {
    const sellerId = sellerFilter.replace(/^SELLER:/, '');
    return requests.filter((request) => {
      const matchesSeller = sellerFilter === 'ALL'
        || (sellerFilter === 'ME' && isMyRequest(request))
        || (sellerFilter.startsWith('SELLER:') && requestCreatorId(request) === sellerId);
      const matchesType = typeFilter === 'ALL' || request.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || request.status === statusFilter;
      return matchesSeller && matchesType && matchesStatus;
    });
  }, [isMyRequest, requests, sellerFilter, statusFilter, typeFilter]);

  const confirmDelivery = async (request: OperationalRequest) => {
    const requestId = String(request.id);
    actionInFlight.current = true;
    setActionId(requestId);
    setFeedback(null);
    setError(null);
    try {
      const updated = await api.deliverOperationalRequest(request.id);
      setRequests((current) => current.map((item) => (
        String(item.id) === requestId ? { ...item, ...updated } : item
      )));
      setFeedback(
        request.type === 'WARRANTY_EXCHANGE'
          ? `Troca #${request.id} entregue. Encaminhe agora a peça com defeito ao estoque.`
          : `Venda #${request.id} marcada como entregue.`,
      );
      await loadRequests(true);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      actionInFlight.current = false;
      setActionId(null);
    }
  };

  return (
    <div
      id="panel-requests"
      className="tab-panel tab-enter"
      role="tabpanel"
      aria-labelledby="tab-requests"
      hidden={!active}
    >
      <div className="workspace-intro requests-intro">
        <div>
          <span className="eyebrow">Acompanhamento</span>
          <h1>Solicitações</h1>
          <p>Acompanhe o que todos os vendedores da loja enviaram para a retaguarda.</p>
        </div>
        <div className="requests-live-actions">
          <span className="requests-live-status" role="status">
            <span className="requests-live-dot" aria-hidden="true" />
            Ao vivo · até 3 s
          </span>
          <button className="button secondary" type="button" disabled={loading} onClick={() => {
            setFeedback(null);
            setError(null);
            setReloadKey((key) => key + 1);
          }}>
            {loading ? 'Atualizando...' : 'Atualizar lista'}
          </button>
        </div>
      </div>

      <div className="request-filter-bar">
        <div className="request-filter-controls">
          <label className="request-list-filter request-seller-filter">
            <span>Vendedor que criou</span>
            <select
              value={sellerFilter}
              disabled={loading}
              onChange={(event) => setSellerFilter(event.target.value)}
            >
              <option value="ALL">Todos os vendedores</option>
              <option value="ME">Meu login — {employeeName(user)}</option>
              {sellerOptions
                .filter((seller) => seller.id !== String(user.id))
                .map((seller) => (
                  <option key={seller.id} value={`SELLER:${seller.id}`}>{seller.name}</option>
                ))}
            </select>
          </label>
          <label className="request-list-filter">
            <span>Tipo</span>
            <select
              value={typeFilter}
              disabled={loading}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="ALL">Todos os tipos</option>
              {REQUEST_TYPE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="request-list-filter">
            <span>Status</span>
            <select
              value={statusFilter}
              disabled={loading}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">Todos os status</option>
              {REQUEST_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <span className="request-filter-count">
          {visibleRequests.length} de {requests.length} solicitação(ões)
        </span>
      </div>

      {feedback && <div className="inline-alert success" role="status">{feedback}</div>}
      {error && <div className="inline-alert error" role="alert">{error}</div>}
      {loading ? (
        <div className="loading-row" aria-live="polite">Carregando solicitações...</div>
      ) : !requests.length ? (
        error ? null : <div className="empty-state">Nenhuma solicitação foi enviada para esta loja.</div>
      ) : !visibleRequests.length ? (
        <div className="empty-state">Nenhuma solicitação encontrada para os filtros selecionados.</div>
      ) : (
        <div className="table-scroll request-list-table">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Tipo</th><th>Cliente</th><th>Criado por</th><th>Loja</th><th>Enviado em</th><th>Status</th><th>Detalhes</th><th>Ação</th></tr></thead>
            <tbody>
              {visibleRequests.map((request) => (
                <tr key={request.id}>
                  <td data-label="ID"><strong>#{request.id}</strong></td>
                  <td data-label="Tipo"><span className={`type-marker type-${request.type.toLowerCase()}`}>{requestTypeLabel(request)}</span></td>
                  <td data-label="Cliente">{request.customer_name || '—'}</td>
                  <td data-label="Criado por" className="request-seller-cell">{requestCreatorName(request)}</td>
                  <td data-label="Loja">{request.store_name || '—'}</td>
                  <td data-label="Enviado em">{formatDate(request.created_at)}</td>
                  <td data-label="Status"><span className={`status-badge status-${request.status.toLowerCase()}`}>{requestStatusLabel(request)}</span></td>
                  <td data-label="Detalhes" className="request-detail-cell">
                    {requestStatusReason(request.status_reason) || `${request.items?.length || 0} item(ns) · ${formatCurrency(Number(request.total_value || 0))}`}
                  </td>
                  <td data-label="Ação">
                    {['SEPARATING', 'READY_FOR_DELIVERY'].includes(request.status) && isMyRequest(request) ? (
                      <button
                        type="button"
                        className="button primary compact-action"
                        disabled={actionId !== null}
                        onClick={() => void confirmDelivery(request)}
                      >
                        {actionId === String(request.id)
                          ? 'Confirmando...'
                          : request.type === 'WARRANTY_EXCHANGE'
                            ? 'Entreguei e recebi a defeituosa'
                            : 'Marcar como entregue'}
                      </button>
                    ) : ['SEPARATING', 'READY_FOR_DELIVERY'].includes(request.status) ? (
                      <span className="table-muted">Aguardando {requestCreatorName(request)}</span>
                    ) : request.status === 'AWAITING_DEFECTIVE' && isMyRequest(request) ? (
                      <span className="table-muted">Levar defeituosa ao estoque</span>
                    ) : (
                      <span className="table-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReturnTab({
  store,
  active,
  onCreated,
  onDraftStateChange,
}: {
  store: Store;
  active: boolean;
  onCreated: () => void;
  onDraftStateChange: (state: DraftState) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<EligiblePurchaseItem[]>([]);
  const [selections, setSelections] = useState<Map<string, WarrantySelection>>(new Map());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    setCustomer(null);
    setPurchases([]);
    setSelections(new Map());
    setNotes('');
    setLoading(false);
    setFeedback(null);
    clientRequestIdRef.current = null;
  }, [store.id]);

  const dirty = Boolean(customer || selections.size || notes.trim());
  useEffect(() => {
    onDraftStateChange({ dirty, submitting });
  }, [dirty, onDraftStateChange, submitting]);

  useEffect(() => {
    if (!customer) {
      setPurchases([]);
      setSelections(new Map());
      setLoading(false);
      return;
    }
    let requestActive = true;
    setLoading(true);
    setFeedback(null);
    api.getEligiblePurchases(customer.id, store.id)
      .then((data) => {
        if (requestActive) setPurchases(data);
      })
      .catch((requestError: Error) => {
        if (requestActive) setFeedback({ kind: 'error', message: requestError.message });
      })
      .finally(() => {
        if (requestActive) setLoading(false);
      });
    return () => {
      requestActive = false;
    };
  }, [customer, store.id]);

  const updateSelection = (item: EligiblePurchaseItem, quantity: number) => {
    if (submitting) return;
    clientRequestIdRef.current = null;
    setFeedback(null);
    const key = item.eligibility_id;
    setSelections((current) => {
      const next = new Map(current);
      if (quantity <= 0) next.delete(key);
      else next.set(key, { item, quantity, defect_description: '' });
      return next;
    });
  };

  const selectedItems = Array.from(selections.values());
  const submit = async () => {
    setFeedback(null);
    if (!customer) {
      setFeedback({ kind: 'error', message: 'Selecione o cliente da devolução.' });
      return;
    }
    if (!selectedItems.length) {
      setFeedback({ kind: 'error', message: 'Selecione pelo menos uma peça comprada.' });
      return;
    }

    setSubmitting(true);
    const clientRequestId = clientRequestIdRef.current || createClientRequestId();
    clientRequestIdRef.current = clientRequestId;
    try {
      const created = await api.createOperationalRequest({
        type: 'RETURN',
        store: store.id,
        customer: customer.id,
        items: selectedItems.map(({ item, quantity }) => ({
          product_id: item.product_id,
          source_order_item: item.source_order_item_id,
          source_warranty: item.source_warranty_id ?? undefined,
          quantity,
        })),
        notes: notes.trim() || undefined,
      }, clientRequestId);
      setSelections(new Map());
      setCustomer(null);
      setNotes('');
      clientRequestIdRef.current = null;
      setFeedback({
        kind: 'success',
        message: `Devolução #${created.id} enviada para conferência do estoque.`,
      });
      onCreated();
    } catch (requestError) {
      setFeedback({ kind: 'error', message: (requestError as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="panel-return"
      className="tab-panel tab-enter"
      role="tabpanel"
      aria-labelledby="tab-return"
      hidden={!active}
    >
      <div className="workspace-intro">
        <div>
          <span className="eyebrow return-color">Nova solicitação</span>
          <h1>Devolução em bom estado</h1>
          <p>Selecione uma compra real. O estoque inspeciona a peça antes de efetivar a devolução.</p>
        </div>
        <div className="workspace-context"><span>Loja</span><strong>{store.name}</strong></div>
      </div>

      <section className="form-section">
        <div className="section-heading">
          <div><span className="step-number">01</span><h2>Cliente</h2></div>
          <p>A devolução será vinculada ao extrato deste cliente.</p>
        </div>
        <CustomerPicker
          store={store}
          selected={customer}
          disabled={submitting}
          onSelect={(nextCustomer) => {
            setCustomer(nextCustomer);
            setPurchases([]);
            setSelections(new Map());
            if (!nextCustomer) setLoading(false);
            setFeedback(null);
            clientRequestIdRef.current = null;
          }}
        />
      </section>

      <section className="form-section warranty-purchases">
        <div className="section-heading">
          <div><span className="step-number">02</span><h2>Peças elegíveis</h2></div>
          <p>{selectedItems.length} item(ns) selecionado(s)</p>
        </div>
        {loading ? <div className="loading-row" aria-live="polite">Buscando histórico de compras...</div> : !customer ? (
          <div className="empty-state">Selecione um cliente para consultar as compras.</div>
        ) : !purchases.length ? (
          <div className="empty-state">Nenhuma peça elegível encontrada para este cliente.</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table warranty-table">
              <thead><tr><th>Origem</th><th>Data</th><th>Peça</th><th>Disponível</th><th>Quantidade</th></tr></thead>
              <tbody>
                {purchases.map((item) => {
                  const key = item.eligibility_id;
                  const selection = selections.get(key);
                  return (
                    <tr className={selection ? 'selected-row' : ''} key={key}>
                      <td data-label="Origem" className="eligible-origin-cell">
                        <strong>{item.order_label}</strong>
                        {item.source_kind === 'WARRANTY_REPLACEMENT' && (
                          <>
                            <span className="replacement-origin-badge">
                              Peça de troca
                            </span>
                            <small>
                              Substituída na garantia #{item.source_warranty_id}
                            </small>
                          </>
                        )}
                      </td>
                      <td data-label="Data">{formatDate(item.order_date)}</td>
                      <td data-label="Peça"><strong>{item.description}</strong>{item.color && <small>{item.color}</small>}</td>
                      <td data-label="Disponível">{item.eligible_quantity} de {item.purchased_quantity}</td>
                      <td data-label="Quantidade">
                        <WarrantyQuantity
                          selection={selection}
                          maximum={item.eligible_quantity}
                          itemLabel={item.description}
                          disabled={submitting}
                          onChange={(quantity) => updateSelection(item, quantity)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="form-footer">
        <label className="field grow-field">
          <span>Motivo ou observações <small>opcional</small></span>
          <input
            value={notes}
            disabled={submitting}
            onChange={(event) => {
              clientRequestIdRef.current = null;
              setFeedback(null);
              setNotes(event.target.value);
            }}
            placeholder="Ex.: desistência, modelo incorreto"
          />
        </label>
        <div className="form-footer-action">
          {feedback && <div className={`inline-alert ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</div>}
          <button className="button primary" type="button" disabled={submitting || loading} onClick={submit}>
            {submitting ? 'Enviando...' : 'Enviar para conferência'}
          </button>
          <p className="action-note">A baixa no extrato e a entrada no estoque acontecem somente após o OK do estoquista.</p>
        </div>
      </div>
    </div>
  );
}

function CancellationTab({
  store,
  active,
  onCreated,
  onDraftStateChange,
}: {
  store: Store;
  active: boolean;
  onCreated: () => void;
  onDraftStateChange: (state: DraftState) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<EligibleCancellationOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [createRefund, setCreateRefund] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);

  const selectedOrder = orders.find((order) => String(order.id) === selectedOrderId) || null;
  const dirty = Boolean(customer || selectedOrderId || createRefund || notes.trim());

  useEffect(() => {
    onDraftStateChange({ dirty, submitting });
  }, [dirty, onDraftStateChange, submitting]);

  useEffect(() => {
    setCustomer(null);
    setOrders([]);
    setSelectedOrderId('');
    setCreateRefund(false);
    setNotes('');
    setFeedback(null);
    clientRequestIdRef.current = null;
  }, [store.id]);

  useEffect(() => {
    if (!customer) {
      setOrders([]);
      setSelectedOrderId('');
      setCreateRefund(false);
      setLoading(false);
      return;
    }
    let requestActive = true;
    setLoading(true);
    setFeedback(null);
    api.getEligibleCancellations(customer.id, store.id)
      .then((data) => {
        if (requestActive) setOrders(data);
      })
      .catch((requestError: Error) => {
        if (requestActive) setFeedback({ kind: 'error', message: requestError.message });
      })
      .finally(() => {
        if (requestActive) setLoading(false);
      });
    return () => {
      requestActive = false;
    };
  }, [customer, store.id]);

  const selectOrder = (order: EligibleCancellationOrder) => {
    if (submitting) return;
    setSelectedOrderId(String(order.id));
    setCreateRefund(false);
    setFeedback(null);
    clientRequestIdRef.current = null;
  };

  const submit = async () => {
    setFeedback(null);
    if (!customer) {
      setFeedback({ kind: 'error', message: 'Selecione o cliente do cancelamento.' });
      return;
    }
    if (!selectedOrder) {
      setFeedback({ kind: 'error', message: 'Selecione a venda que será cancelada.' });
      return;
    }
    if (createRefund && !selectedOrder.has_refundable_payment) {
      setFeedback({ kind: 'error', message: 'Esta venda não possui valor pago para reembolso.' });
      return;
    }

    setSubmitting(true);
    const clientRequestId = clientRequestIdRef.current || createClientRequestId();
    clientRequestIdRef.current = clientRequestId;
    try {
      const created = await api.createOperationalRequest({
        type: 'CANCELLATION',
        store: store.id,
        customer: customer.id,
        source_order: selectedOrder.id,
        create_refund: createRefund,
        items: [],
        notes: notes.trim() || undefined,
      }, clientRequestId);
      setCustomer(null);
      setOrders([]);
      setSelectedOrderId('');
      setCreateRefund(false);
      setNotes('');
      clientRequestIdRef.current = null;
      setFeedback({
        kind: 'success',
        message: `Cancelamento #${created.id} enviado para aprovação da retaguarda.`,
      });
      onCreated();
    } catch (requestError) {
      setFeedback({ kind: 'error', message: (requestError as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="panel-cancellation"
      className="tab-panel tab-enter"
      role="tabpanel"
      aria-labelledby="tab-cancellation"
      hidden={!active}
    >
      <div className="workspace-intro">
        <div>
          <span className="eyebrow cancellation-color">Nova solicitação</span>
          <h1>Cancelamento de venda</h1>
          <p>Selecione a venda inteira e escolha se o valor pago será devolvido em dinheiro ou mantido como crédito na loja.</p>
        </div>
        <div className="workspace-context"><span>Loja</span><strong>{store.name}</strong></div>
      </div>

      <section className="form-section">
        <div className="section-heading">
          <div><span className="step-number">01</span><h2>Cliente</h2></div>
          <p>Somente vendas confirmadas e ainda não devolvidas podem ser canceladas.</p>
        </div>
        <CustomerPicker
          store={store}
          selected={customer}
          disabled={submitting}
          onSelect={(nextCustomer) => {
            setCustomer(nextCustomer);
            setOrders([]);
            setSelectedOrderId('');
            setCreateRefund(false);
            setFeedback(null);
            clientRequestIdRef.current = null;
          }}
        />
      </section>

      <section className="form-section cancellation-orders">
        <div className="section-heading">
          <div><span className="step-number">02</span><h2>Venda para cancelar</h2></div>
          <p>{selectedOrder ? selectedOrder.order_label : 'Nenhuma venda selecionada'}</p>
        </div>
        {loading ? <div className="loading-row" aria-live="polite">Buscando vendas do cliente...</div> : !customer ? (
          <div className="empty-state">Selecione um cliente para consultar as vendas.</div>
        ) : !orders.length ? (
          <div className="empty-state">Nenhuma venda disponível para cancelamento.</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table cancellation-table">
              <thead><tr><th>Selecionar</th><th>Venda</th><th>Data</th><th>Peças</th><th>Pagamento</th><th>Total</th><th>Reembolsável</th></tr></thead>
              <tbody>
                {orders.map((order) => {
                  const selected = String(order.id) === selectedOrderId;
                  return (
                    <tr className={selected ? 'selected-row' : ''} key={order.id} onClick={() => selectOrder(order)}>
                      <td data-label="Selecionar">
                        <input
                          type="radio"
                          name="cancellation-order"
                          checked={selected}
                          disabled={submitting}
                          onChange={() => selectOrder(order)}
                          aria-label={`Selecionar ${order.order_label}`}
                        />
                      </td>
                      <td data-label="Venda"><strong>{order.order_label}</strong></td>
                      <td data-label="Data">{formatDate(order.sale_date)}</td>
                      <td data-label="Peças" className="cancellation-items-cell">
                        {order.items.map((item) => `${item.quantity}× ${item.description}`).join(', ')}
                      </td>
                      <td data-label="Pagamento">{order.payment_method_display}</td>
                      <td data-label="Total"><strong>{formatCurrency(Number(order.total_value))}</strong></td>
                      <td data-label="Reembolsável">{formatCurrency(Number(order.refundable_amount))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="form-section cancellation-decision">
        <div className="section-heading">
          <div><span className="step-number">03</span><h2>Como o valor foi resolvido?</h2></div>
        </div>
        <label className={`refund-choice ${createRefund ? 'selected' : ''} ${selectedOrder && !selectedOrder.has_refundable_payment ? 'unavailable' : ''}`}>
          <input
            type="checkbox"
            checked={createRefund}
            disabled={submitting || !selectedOrder?.has_refundable_payment}
            onChange={(event) => {
              setCreateRefund(event.target.checked);
              setFeedback(null);
              clientRequestIdRef.current = null;
            }}
          />
          <span>
            <strong>
              {selectedOrder && !selectedOrder.has_refundable_payment
                ? 'Não há dinheiro registrado para devolver'
                : 'O dinheiro já foi devolvido em mãos ao cliente'}
            </strong>
            <small>
              {selectedOrder?.has_refundable_payment
                ? `Marque somente depois de entregar ${formatCurrency(Number(selectedOrder.refundable_amount))} ao cliente.`
                : selectedOrder
                  ? `${selectedOrder.order_label} está como ${selectedOrder.payment_method_display}, com ${formatCurrency(Number(selectedOrder.refundable_amount))} recebido.`
                  : 'Selecione uma venda para escolher o destino do valor.'}
            </small>
          </span>
        </label>
        {selectedOrder && !selectedOrder.has_refundable_payment ? (
          <div className="cancellation-no-payment" role="note">
            <div className="cancellation-route-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="11" />
                <path d="m8.5 8.5 15 15" />
              </svg>
            </div>
            <div>
              <span className="cancellation-route-label">SEM PAGAMENTO REGISTRADO</span>
              <strong>O cancelamento retirará somente a dívida desta venda</strong>
              <ul>
                <li><b>Dinheiro devolvido:</b> R$ 0,00</li>
                <li><b>Crédito na loja:</b> R$ 0,00</li>
                <li><b>Dívida de {formatCurrency(Number(selectedOrder.total_value))}:</b> será cancelada</li>
              </ul>
              <p>Se o cliente realmente pagou essa venda, o pagamento precisa ser registrado no sistema antes de marcar dinheiro devolvido.</p>
            </div>
          </div>
        ) : (
          <div className="cancellation-routes" aria-label="O que acontece com o botão marcado ou desmarcado">
            <div className={`cancellation-route cash ${createRefund ? 'active' : ''}`}>
              <div className="cancellation-route-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32">
                  <rect x="4" y="8" width="24" height="16" rx="3" />
                  <circle cx="16" cy="16" r="4" />
                  <path d="M8 12h2M22 20h2" />
                </svg>
              </div>
              <div>
                <span className="cancellation-route-label">BOTÃO MARCADO</span>
                <strong>Dinheiro entregue em mãos</strong>
                <ul>
                  <li>Registra o reembolso como concluído</li>
                  <li><b>Crédito gerado:</b> R$ 0,00</li>
                  <li><b>Outras pendências:</b> não altera</li>
                </ul>
              </div>
            </div>
            <div className={`cancellation-route credit ${selectedOrder && !createRefund ? 'active' : ''}`}>
              <div className="cancellation-route-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32">
                  <path d="M5 10.5h20a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-14a4 4 0 0 1 4-4h15" />
                  <path d="M22 16h6v6h-6a3 3 0 0 1 0-6Z" />
                  <circle cx="23" cy="19" r=".8" />
                </svg>
              </div>
              <div>
                <span className="cancellation-route-label">BOTÃO DESMARCADO</span>
                <strong>Valor vira crédito na loja</strong>
                <ul>
                  <li>Não registra dinheiro entregue</li>
                  <li><b>Valor pago:</b> vira crédito</li>
                  <li><b>Outras pendências:</b> pode abater</li>
                </ul>
              </div>
            </div>
          </div>
        )}
        <div className={`cancellation-result ${selectedOrder && !selectedOrder.has_refundable_payment ? 'no-payment' : createRefund ? 'cash' : 'credit'}`} role="status">
          <strong>Se enviar agora:</strong>
          <span>
            {!selectedOrder
              ? ' selecione uma venda para visualizar o resultado.'
              : createRefund
                ? ` será registrado que ${formatCurrency(Number(selectedOrder.refundable_amount))} já foi entregue em mãos. Nenhum crédito será gerado e as outras pendências não serão alteradas.`
                : selectedOrder.has_refundable_payment
                  ? ` ${formatCurrency(Number(selectedOrder.refundable_amount))} será lançado como crédito na loja e poderá abater outras pendências.`
                  : ` a dívida de ${formatCurrency(Number(selectedOrder.total_value))} será cancelada. Não será gerado reembolso nem crédito na loja, pois não existe pagamento registrado.`}
          </span>
        </div>
        <p className="cancellation-credit-note">
          Depois, existe somente a confirmação do cancelamento pela retaguarda. Não haverá uma segunda aprovação do reembolso.
        </p>
      </section>

      <div className="form-footer">
        <label className="field grow-field">
          <span>Motivo ou observações <small>opcional</small></span>
          <input
            value={notes}
            disabled={submitting}
            onChange={(event) => {
              setNotes(event.target.value);
              setFeedback(null);
              clientRequestIdRef.current = null;
            }}
            placeholder="Ex.: cliente desistiu da compra"
          />
        </label>
        <div className="form-footer-action">
          {feedback && <div className={`inline-alert ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</div>}
          <button className="button danger" type="button" disabled={submitting || loading || !selectedOrder} onClick={submit}>
            {submitting ? 'Enviando...' : 'Enviar cancelamento para aprovação'}
          </button>
          <p className="action-note">O cancelamento e o lançamento financeiro acontecem somente após a aprovação da retaguarda.</p>
        </div>
      </div>
    </div>
  );
}

export default function EmployeeWorkspace({ user, onLogout }: { user: EmployeeUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('sale');
  const [storeId, setStoreId] = useState(() => String(user.allowed_stores?.[0]?.id || ''));
  const [refreshKey, setRefreshKey] = useState(0);
  const [saleDraft, setSaleDraft] = useState<DraftState>({ dirty: false, submitting: false });
  const [warrantyDraft, setWarrantyDraft] = useState<DraftState>({ dirty: false, submitting: false });
  const [returnDraft, setReturnDraft] = useState<DraftState>({ dirty: false, submitting: false });
  const [cancellationDraft, setCancellationDraft] = useState<DraftState>({ dirty: false, submitting: false });
  const stores = useMemo(() => user.allowed_stores || [], [user.allowed_stores]);
  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === storeId) || null,
    [storeId, stores],
  );

  const handleCreated = () => setRefreshKey((key) => key + 1);
  const handleSaleDraft = useCallback((state: DraftState) => setSaleDraft(state), []);
  const handleWarrantyDraft = useCallback((state: DraftState) => setWarrantyDraft(state), []);
  const handleReturnDraft = useCallback((state: DraftState) => setReturnDraft(state), []);
  const handleCancellationDraft = useCallback((state: DraftState) => setCancellationDraft(state), []);
  const isSubmitting = saleDraft.submitting || warrantyDraft.submitting || returnDraft.submitting || cancellationDraft.submitting;
  const hasDraft = saleDraft.dirty || warrantyDraft.dirty || returnDraft.dirty || cancellationDraft.dirty;

  const changeStore = (nextStoreId: string) => {
    if (nextStoreId === storeId || isSubmitting) return;
    if (hasDraft && !window.confirm('Trocar de loja descartará os rascunhos de venda, garantia, devolução e cancelamento. Deseja continuar?')) {
      return;
    }
    setStoreId(nextStoreId);
  };

  const changeTab = (tab: WorkspaceTab) => {
    if (!isSubmitting) setActiveTab(tab);
  };

  const requestLogout = () => {
    if (isSubmitting) return;
    if (hasDraft && !window.confirm('Sair agora descartará seus rascunhos. Deseja continuar?')) return;
    onLogout();
  };

  return (
    <div className="employee-shell">
      <header className="employee-header">
        <div className="employee-brand">
          <img className="employee-logo" src="/icons/Logo Center Cell.jpeg" alt="Center Peças" />
          <div><strong>Center Peças</strong><span>Pedido Rápido · Área do funcionário</span></div>
        </div>
        <div className="employee-header-actions">
          {stores.length > 0 && (
            <label className="store-switcher">
              <span>Loja</span>
              <select value={storeId} disabled={isSubmitting} onChange={(event) => changeStore(event.target.value)}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
          )}
          <div className="employee-identity"><strong>{employeeName(user)}</strong><span>{user.email}</span></div>
          <button className="button ghost" type="button" disabled={isSubmitting} onClick={requestLogout}>Sair</button>
        </div>
      </header>

      <nav className="workspace-tabs" role="tablist" aria-label="Funcionalidades do Pedido Rápido">
        {([
          ['sale', 'Venda'],
          ['warranty', 'Garantia / Troca'],
          ['return', 'Devolução'],
          ['cancellation', 'Cancelamento'],
          ['requests', 'Solicitações'],
        ] as [WorkspaceTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            id={`tab-${tab}`}
            type="button"
            role="tab"
            className={activeTab === tab ? 'active' : ''}
            aria-selected={activeTab === tab}
            aria-controls={`panel-${tab}`}
            disabled={isSubmitting}
            onClick={() => changeTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="employee-main">
        {!selectedStore && (
          <div className="empty-state prominent">
            <strong>Nenhuma loja vinculada</strong>
            <span>Peça a um administrador para vincular uma loja ao seu usuário.</span>
          </div>
        )}
        {selectedStore && (
          <>
            <SaleTab
              store={selectedStore}
              active={activeTab === 'sale'}
              onCreated={handleCreated}
              onDraftStateChange={handleSaleDraft}
            />
            <WarrantyTab
              store={selectedStore}
              active={activeTab === 'warranty'}
              onCreated={handleCreated}
              onDraftStateChange={handleWarrantyDraft}
            />
            <ReturnTab
              store={selectedStore}
              active={activeTab === 'return'}
              onCreated={handleCreated}
              onDraftStateChange={handleReturnDraft}
            />
            <CancellationTab
              store={selectedStore}
              active={activeTab === 'cancellation'}
              onCreated={handleCreated}
              onDraftStateChange={handleCancellationDraft}
            />
          </>
        )}
        {selectedStore && (
          <RequestsTab
            refreshKey={refreshKey}
            active={activeTab === 'requests'}
            store={selectedStore}
            user={user}
          />
        )}
      </main>
    </div>
  );
}
