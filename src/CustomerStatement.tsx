import { useState, useEffect, useCallback, useMemo } from 'react';
import { customerApi } from './customerAuth';
import type { StatementResponse, StatementMovement } from './customerAuth';

const STATEMENT_WINDOW_DAYS = 30;

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

function formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getStartOfDay(date = new Date()): Date {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    return normalizedDate;
}

function addDays(date: Date, days: number): Date {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function parseInputDate(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const [, year, month, day] = match;
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
    parsedDate.setHours(0, 0, 0, 0);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function parseMovementDate(value: string | null): number {
    if (!value) return Number.NEGATIVE_INFINITY;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parsedDate = parseInputDate(value);
        return parsedDate ? parsedDate.getTime() : Number.NEGATIVE_INFINITY;
    }

    const slashDateMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (slashDateMatch) {
        const [, day, month, year, hours = '0', minutes = '0', seconds = '0'] = slashDateMatch;
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hours),
            Number(minutes),
            Number(seconds),
        ).getTime();
    }

    const parsedTimestamp = Date.parse(value);
    return Number.isNaN(parsedTimestamp) ? Number.NEGATIVE_INFINITY : parsedTimestamp;
}

function getStatementDateLimits() {
    const maxDate = getStartOfDay();
    const minDate = addDays(maxDate, -(STATEMENT_WINDOW_DAYS - 1));

    return {
        minDate: formatDateInput(minDate),
        maxDate: formatDateInput(maxDate),
    };
}

function normalizeStatementRange(startDate: string, endDate: string, minDate: string, maxDate: string) {
    const minDateObject = parseInputDate(minDate) ?? getStartOfDay();
    const maxDateObject = parseInputDate(maxDate) ?? getStartOfDay();

    let normalizedStart = parseInputDate(startDate) ?? new Date(minDateObject);
    let normalizedEnd = parseInputDate(endDate) ?? new Date(maxDateObject);

    if (normalizedStart < minDateObject) normalizedStart = new Date(minDateObject);
    if (normalizedStart > maxDateObject) normalizedStart = new Date(maxDateObject);
    if (normalizedEnd < minDateObject) normalizedEnd = new Date(minDateObject);
    if (normalizedEnd > maxDateObject) normalizedEnd = new Date(maxDateObject);
    if (normalizedStart > normalizedEnd) normalizedStart = new Date(normalizedEnd);

    return {
        startDate: formatDateInput(normalizedStart),
        endDate: formatDateInput(normalizedEnd),
    };
}

const MOVEMENT_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
    VENDA: { label: 'Compra', color: '#1d4ed8', bgColor: '#eff6ff', icon: '🛒' },
    CANCELAMENTO: { label: 'Cancelamento', color: '#b91c1c', bgColor: '#fef2f2', icon: '❌' },
    PAGAMENTO: { label: 'Pagamento', color: '#15803d', bgColor: '#f0fdf4', icon: '💰' },
    PAGAMENTO_CANCELADO: { label: 'Pgto Cancelado', color: '#b91c1c', bgColor: '#fef2f2', icon: '⚠️' },
    REEMBOLSO: { label: 'Reembolso', color: '#1d4ed8', bgColor: '#eff6ff', icon: '↩️' },
    DEVOLUCAO: { label: 'Devolução', color: '#0f766e', bgColor: '#f0fdfa', icon: '📦' },
    DIVIDA_HISTORICA: { label: 'Dívida Histórica', color: '#b45309', bgColor: '#fffbeb', icon: '📋' },
    CREDITO_REEMBOLSO: { label: 'Crédito', color: '#15803d', bgColor: '#f0fdf4', icon: '💳' },
    SALDO_ANTERIOR: { label: 'Saldo Anterior', color: '#4f46e5', bgColor: '#eef2ff', icon: '📋' },
};

function getMovementConfig(type: string) {
    return MOVEMENT_CONFIG[type] || { label: type, color: '#374151', bgColor: '#f3f4f6', icon: '•' };
}

interface CustomerStatementProps {
    onBack: () => void;
}

export default function CustomerStatement({ onBack }: CustomerStatementProps) {
    const [statement, setStatement] = useState<StatementResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notLinked, setNotLinked] = useState(false);
    const [{ minDate, maxDate }] = useState(getStatementDateLimits);
    const [startDate, setStartDate] = useState(() => minDate);
    const [endDate, setEndDate] = useState(() => maxDate);

    const loadStatement = useCallback(async () => {
        setLoading(true);
        setError(null);
        setNotLinked(false);

        try {
            const normalizedRange = normalizeStatementRange(startDate, endDate, minDate, maxDate);
            const data = await customerApi.getStatement({
                start_date: normalizedRange.startDate,
                end_date: normalizedRange.endDate,
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
    }, [endDate, maxDate, minDate, startDate]);

    useEffect(() => {
        loadStatement();
    }, [loadStatement]);

    const handleClearFilters = () => {
        setStartDate(minDate);
        setEndDate(maxDate);
    };

    const handleStartDateChange = (value: string) => {
        const normalizedRange = normalizeStatementRange(value, endDate, minDate, maxDate);
        setStartDate(normalizedRange.startDate);
        setEndDate(normalizedRange.endDate);
    };

    const handleEndDateChange = (value: string) => {
        const normalizedRange = normalizeStatementRange(startDate, value, minDate, maxDate);
        setStartDate(normalizedRange.startDate);
        setEndDate(normalizedRange.endDate);
    };

    const displayedMovements = useMemo(() => {
        if (!statement) return [];

        const startTimestamp = parseInputDate(startDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
        const endDateObject = parseInputDate(endDate);
        const endTimestamp = endDateObject
            ? new Date(
                endDateObject.getFullYear(),
                endDateObject.getMonth(),
                endDateObject.getDate(),
                23,
                59,
                59,
                999,
            ).getTime()
            : Number.POSITIVE_INFINITY;

        return statement.movements
            .map((movement, index) => ({
                movement,
                index,
                timestamp: parseMovementDate(movement.date),
            }))
            .filter(({ movement, timestamp }) => movement.date === null || (timestamp >= startTimestamp && timestamp <= endTimestamp))
            .sort((movementA, movementB) => {
                const dateDifference = movementB.timestamp - movementA.timestamp;
                if (dateDifference !== 0) return dateDifference;

                const referenceA = movementA.movement.reference_id ?? -1;
                const referenceB = movementB.movement.reference_id ?? -1;
                if (referenceA !== referenceB) return referenceB - referenceA;

                return movementB.index - movementA.index;
            })
            .map(({ movement }) => movement);
    }, [endDate, startDate, statement]);

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

            <div className="statement-filters">
                <p className="statement-customer-name">Exibindo no máximo os últimos 30 dias.</p>
                <div className="statement-filter-row">
                    <div className="statement-filter-field">
                        <label>De:</label>
                        <input
                            type="date"
                            value={startDate}
                            min={minDate}
                            max={endDate}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                        />
                    </div>
                    <div className="statement-filter-field">
                        <label>Até:</label>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate}
                            max={maxDate}
                            onChange={(e) => handleEndDateChange(e.target.value)}
                        />
                    </div>
                    {(startDate !== minDate || endDate !== maxDate) && (
                        <button className="btn btn-secondary btn-sm" onClick={handleClearFilters}>
                            Limpar
                        </button>
                    )}
                </div>
            </div>

            {loading && <div className="loading">Carregando extrato...</div>}
            {error && <div className="statement-error">{error}</div>}

            {!loading && !error && statement && (
                <>
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
                                {displayedMovements.map((movement: StatementMovement, index: number) => {
                                    const config = getMovementConfig(movement.type);
                                    return (
                                        <tr key={`${movement.reference_id ?? 'movement'}-${index}`} className={`movement-row movement-${movement.type.toLowerCase()}`}>
                                            <td className="movement-date">{movement.date || '—'}</td>
                                            <td>
                                                <span className="movement-badge" style={{ backgroundColor: config.bgColor, color: config.color }}>
                                                    {config.icon} {config.label}
                                                </span>
                                            </td>
                                            <td className="movement-desc">{movement.description}</td>
                                            <td className="text-right debit">
                                                {movement.debit > 0 ? formatCurrency(movement.debit) : ''}
                                            </td>
                                            <td className="text-right credit">
                                                {movement.credit > 0 ? formatCurrency(movement.credit) : ''}
                                            </td>
                                            <td className={`text-right balance ${movement.running_balance > 0 ? 'negative' : movement.running_balance < 0 ? 'positive' : ''}`}>
                                                {formatCurrency(Math.abs(movement.running_balance))}
                                                {movement.running_balance > 0 ? ' D' : movement.running_balance < 0 ? ' C' : ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {displayedMovements.length === 0 && (
                        <div className="empty-state">Nenhuma movimentação encontrada.</div>
                    )}
                </>
            )}
        </div>
    );
}
