import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, createClientRequestId } from './api';
import ProductBrowser from './ProductBrowser';
import type {
  Bank,
  CartItem,
  Customer,
  EligiblePurchaseItem,
  EmployeeUser,
  OperationalRequest,
  PaymentMethod,
  Product,
  Store,
  WarrantySelection,
} from './types';
import { formatCurrency } from './whatsapp';

type WorkspaceTab = 'sale' | 'warranty' | 'requests' | 'return';

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

const REQUEST_TYPE_LABELS: Record<string, string> = {
  SALE: 'Venda',
  WARRANTY_EXCHANGE: 'Garantia / Troca',
  RETURN: 'Devolução',
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
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
    setPaymentMethod('PIX');
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
  const needsBank = paymentMethod !== 'PENDING';
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
        payment_method: paymentMethod,
        number_of_installments: installments,
        bank: needsBank ? bankId : null,
        notes: notes.trim() || undefined,
      }, clientRequestId);
      setCart(new Map());
      setCustomer(null);
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
                  setPaymentMethod(event.target.value as PaymentMethod);
                }}
              >
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
    <div className="quantity-input compact">
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
    const key = String(item.source_order_item_id);
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
              <thead><tr><th>Venda</th><th>Data</th><th>Peça</th><th>Disponível</th><th>Quantidade</th><th>Defeito</th></tr></thead>
              <tbody>
                {purchases.map((item) => {
                  const key = String(item.source_order_item_id);
                  const selection = selections.get(key);
                  return (
                    <tr className={selection ? 'selected-row' : ''} key={key}>
                      <td data-label="Venda"><strong>{item.order_label}</strong></td>
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

function RequestsTab({ refreshKey, active }: { refreshKey: number; active: boolean }) {
  const [requests, setRequests] = useState<OperationalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const loadRequests = useCallback(async (silent = false) => {
    const sequence = ++loadSequence.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await api.getMyOperationalRequests();
      if (sequence !== loadSequence.current) return;
      setRequests(data);
      setError(null);
    } catch (requestError) {
      if (sequence !== loadSequence.current) return;
      setError((requestError as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      loadSequence.current += 1;
      return;
    }
    void loadRequests();
    const interval = window.setInterval(() => void loadRequests(true), 30_000);
    return () => {
      loadSequence.current += 1;
      window.clearInterval(interval);
    };
  }, [active, loadRequests, refreshKey, reloadKey]);

  const confirmDelivery = async (request: OperationalRequest) => {
    const requestId = String(request.id);
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
      <div className="workspace-intro">
        <div>
          <span className="eyebrow">Acompanhamento</span>
          <h1>Minhas solicitações</h1>
          <p>Acompanhe o andamento do que você enviou para a retaguarda.</p>
        </div>
        <button className="button secondary" type="button" disabled={loading} onClick={() => {
          setFeedback(null);
          setError(null);
          setReloadKey((key) => key + 1);
        }}>
          {loading ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </div>

      {feedback && <div className="inline-alert success" role="status">{feedback}</div>}
      {error && <div className="inline-alert error" role="alert">{error}</div>}
      {loading ? (
        <div className="loading-row" aria-live="polite">Carregando solicitações...</div>
      ) : !requests.length ? (
        error ? null : <div className="empty-state">Você ainda não enviou solicitações.</div>
      ) : (
        <div className="table-scroll request-list-table">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Tipo</th><th>Cliente</th><th>Loja</th><th>Enviado em</th><th>Status</th><th>Detalhes</th><th>Ação</th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td data-label="ID"><strong>#{request.id}</strong></td>
                  <td data-label="Tipo"><span className={`type-marker type-${request.type.toLowerCase()}`}>{requestTypeLabel(request)}</span></td>
                  <td data-label="Cliente">{request.customer_name || '—'}</td>
                  <td data-label="Loja">{request.store_name || '—'}</td>
                  <td data-label="Enviado em">{formatDate(request.created_at)}</td>
                  <td data-label="Status"><span className={`status-badge status-${request.status.toLowerCase()}`}>{requestStatusLabel(request)}</span></td>
                  <td data-label="Detalhes" className="request-detail-cell">
                    {request.status_reason || `${request.items?.length || 0} item(ns) · ${formatCurrency(Number(request.total_value || 0))}`}
                  </td>
                  <td data-label="Ação">
                    {request.status === 'READY_FOR_DELIVERY' ? (
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
                    ) : request.status === 'AWAITING_DEFECTIVE' ? (
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
    const key = String(item.source_order_item_id);
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
              <thead><tr><th>Venda</th><th>Data</th><th>Peça</th><th>Disponível</th><th>Quantidade</th></tr></thead>
              <tbody>
                {purchases.map((item) => {
                  const key = String(item.source_order_item_id);
                  const selection = selections.get(key);
                  return (
                    <tr className={selection ? 'selected-row' : ''} key={key}>
                      <td data-label="Venda"><strong>{item.order_label}</strong></td>
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

export default function EmployeeWorkspace({ user, onLogout }: { user: EmployeeUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('sale');
  const [storeId, setStoreId] = useState(() => String(user.allowed_stores?.[0]?.id || ''));
  const [refreshKey, setRefreshKey] = useState(0);
  const [saleDraft, setSaleDraft] = useState<DraftState>({ dirty: false, submitting: false });
  const [warrantyDraft, setWarrantyDraft] = useState<DraftState>({ dirty: false, submitting: false });
  const [returnDraft, setReturnDraft] = useState<DraftState>({ dirty: false, submitting: false });
  const stores = useMemo(() => user.allowed_stores || [], [user.allowed_stores]);
  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === storeId) || null,
    [storeId, stores],
  );

  const handleCreated = () => setRefreshKey((key) => key + 1);
  const handleSaleDraft = useCallback((state: DraftState) => setSaleDraft(state), []);
  const handleWarrantyDraft = useCallback((state: DraftState) => setWarrantyDraft(state), []);
  const handleReturnDraft = useCallback((state: DraftState) => setReturnDraft(state), []);
  const isSubmitting = saleDraft.submitting || warrantyDraft.submitting || returnDraft.submitting;
  const hasDraft = saleDraft.dirty || warrantyDraft.dirty || returnDraft.dirty;

  const changeStore = (nextStoreId: string) => {
    if (nextStoreId === storeId || isSubmitting) return;
    if (hasDraft && !window.confirm('Trocar de loja descartará os rascunhos de venda, garantia e devolução. Deseja continuar?')) {
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
          ['requests', 'Minhas solicitações'],
          ['return', 'Devolução'],
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
        {!selectedStore && activeTab !== 'requests' && (
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
          </>
        )}
        <RequestsTab refreshKey={refreshKey} active={activeTab === 'requests'} />
      </main>
    </div>
  );
}
