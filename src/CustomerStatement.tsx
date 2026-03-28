import { useState, useEffect, useCallback } from 'react';
import { customerApi } from './customerAuth';
import type { StatementResponse, StatementMovement } from './customerAuth';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

// Movement type labels and colors
const MOVEMENT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    VENDA: { label: 'Venda', color: '#ef4444', icon: '🛒' },
    CANCELAMENTO: { label: 'Cancelamento', color: '#22c55e', icon: '❌' },
    PAGAMENTO: { label: 'Pagamento', color: '#22c55e', icon: '💰' },
    PAGAMENTO_CANCELADO: { label: 'Pgto Cancelado', color: '#ef4444', icon: '⚠️' },
    REEMBOLSO: { label: 'Reembolso', color: '#ef4444', icon: '↩️' },
    DEVOLUCAO: { label: 'Devolução', color: '#22c55e', icon: '📦' },
    DIVIDA_HISTORICA: { label: 'Saldo Anterior', color: '#6b7280', icon: '📋' },
    CREDITO_REEMBOLSO: { label: 'Crédito', color: '#22c55e', icon: '💳' },
    SALDO_ANTERIOR: { label: 'Saldo Anterior', color: '#6b7280', icon: '📋' },
};

function getMovementConfig(type: string) {
    return MOVEMENT_CONFIG[type] || { label: type, color: '#6b7280', icon: '•' };
}

interface CustomerStatementProps {
    onBack: () => void;
}

export default function CustomerStatement({ onBack }: CustomerStatementProps) {
    const [statement, setStatement] = useState<StatementResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notLinked, setNotLinked] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const loadStatement = useCallback(async () => {
        setLoading(true);
        setError(null);
        setNotLinked(false);
        try {
            const data = await customerApi.getStatement({
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            });
            setStatement(data);
        } catch (err) {
            if (err instanceof Error && err.message === 'NOT_LINKED') {
                setNotLinked(true);
            } else {
                setError(err instanceof Error ? err.message : 'Erro ao carregar extrato.');
            }
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        loadStatement();
    }, [loadStatement]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
    };

    if (notLinked) {
        return (
            <div className="statement-page">
                <div className="statement-header">
                    <button className="login-back-btn" onClick={onBack} type="button">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5"></path>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </button>
                    <h2>Meu Extrato</h2>
                </div>
                <div className="statement-not-linked">
                    <div className="not-linked-icon">🔗</div>
                    <h3>Conta não vinculada</h3>
                    <p>
                        Sua conta ainda não foi vinculada ao seu cadastro de cliente.
                        Entre em contato com a loja para solicitar a vinculação e ter acesso ao seu extrato.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="statement-page">
            <div className="statement-header">
                <button className="login-back-btn" onClick={onBack} type="button">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5"></path>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                </button>
                <div>
                    <h2>Meu Extrato</h2>
                    {statement && <p className="statement-customer-name">{statement.customer_name}</p>}
                </div>
            </div>

            {/* Balance Summary */}
            {statement && (
                <div className="statement-balance-cards">
                    <div className={`balance-card ${statement.current_balance > 0 ? 'negative' : 'positive'}`}>
                        <span className="balance-label">Saldo Atual</span>
                        <span className="balance-value">
                            {statement.current_balance > 0
                                ? `${formatCurrency(statement.current_balance)} devedor`
                                : statement.current_balance < 0
                                    ? `${formatCurrency(Math.abs(statement.current_balance))} crédito`
                                    : 'R$ 0,00'}
                        </span>
                    </div>
                    {statement.credit_balance > 0 && (
                        <div className="balance-card positive">
                            <span className="balance-label">Crédito Disponível</span>
                            <span className="balance-value">{formatCurrency(statement.credit_balance)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Date Filters */}
            <div className="statement-filters">
                <div className="statement-filter-row">
                    <div className="statement-filter-field">
                        <label>De:</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="statement-filter-field">
                        <label>Até:</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    {(startDate || endDate) && (
                        <button className="btn btn-secondary btn-sm" onClick={handleClearFilters}>
                            Limpar
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            {loading && <div className="loading">Carregando extrato...</div>}
            {error && <div className="statement-error">{error}</div>}

            {!loading && !error && statement && (
                <>
                    {/* Desktop & Mobile Table View */}
                    <div className="statement-table-wrapper">
                        <table className="statement-table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Tipo</th>
                                    <th>Descrição</th>
                                    <th className="text-right">Débito</th>
                                    <th className="text-right">Crédito</th>
                                    <th className="text-right">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statement.movements.map((m: StatementMovement, i: number) => {
                                    const config = getMovementConfig(m.type);
                                    return (
                                        <tr key={i} className={`movement-row movement-${m.type.toLowerCase()}`}>
                                            <td className="movement-date">{m.date || '—'}</td>
                                            <td>
                                                <span className="movement-badge" style={{ backgroundColor: config.color + '20', color: config.color }}>
                                                    {config.icon} {config.label}
                                                </span>
                                            </td>
                                            <td className="movement-desc">{m.description}</td>
                                            <td className="text-right debit">
                                                {m.debit > 0 ? formatCurrency(m.debit) : ''}
                                            </td>
                                            <td className="text-right credit">
                                                {m.credit > 0 ? formatCurrency(m.credit) : ''}
                                            </td>
                                            <td className={`text-right balance ${m.running_balance > 0 ? 'negative' : m.running_balance < 0 ? 'positive' : ''}`}>
                                                {formatCurrency(Math.abs(m.running_balance))}
                                                {m.running_balance > 0 ? ' D' : m.running_balance < 0 ? ' C' : ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>


                    {statement.movements.length === 0 && (
                        <div className="empty-state">Nenhuma movimentação encontrada.</div>
                    )}
                </>
            )}
        </div>
    );
}
