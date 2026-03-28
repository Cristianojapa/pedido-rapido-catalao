import { useState, useRef } from 'react';
import type { CustomerPortalUser } from './customerAuth';
import { customerApi } from './customerAuth';

interface CustomerLoginProps {
    onLoginSuccess: (user: CustomerPortalUser) => void;
    onBack: () => void;
}

export default function CustomerLogin({ onLoginSuccess, onBack }: CustomerLoginProps) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [identifier, setIdentifier] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [identifierType, setIdentifierType] = useState<'phone' | 'email'>('phone');
    const formRef = useRef<HTMLFormElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!identifier.trim()) {
            setError(identifierType === 'phone' ? 'Digite seu telefone.' : 'Digite seu email.');
            return;
        }

        if (!password) {
            setError('Digite sua senha.');
            return;
        }

        if (mode === 'register') {
            if (!name.trim()) {
                setError('Digite seu nome.');
                return;
            }
            if (password.length < 6) {
                setError('A senha deve ter no mínimo 6 caracteres.');
                return;
            }
            if (password !== confirmPassword) {
                setError('As senhas não coincidem.');
                return;
            }
        }

        setLoading(true);
        try {
            if (mode === 'login') {
                const result = await customerApi.login(identifier.trim(), password);
                onLoginSuccess(result.user);
            } else {
                const data: { phone?: string; email?: string; name: string; password: string } = {
                    name: name.trim(),
                    password,
                };
                if (identifierType === 'phone') {
                    data.phone = identifier.replace(/\D/g, '');
                } else {
                    data.email = identifier.trim();
                }
                const result = await customerApi.register(data);
                onLoginSuccess(result.user);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro inesperado.');
        } finally {
            setLoading(false);
        }
    };

    const formatPhone = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 2) return digits;
        if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <button className="login-back-btn" onClick={onBack} type="button">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5"></path>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </button>
                    <div>
                        <h2>{mode === 'login' ? 'Entrar' : 'Criar Conta'}</h2>
                        <p className="login-subtitle">
                            {mode === 'login'
                                ? 'Entre com seu telefone ou email'
                                : 'Crie sua conta para acessar o extrato'}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="login-error">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                        {error}
                    </div>
                )}

                <form ref={formRef} onSubmit={handleSubmit}>
                    {/* Identifier Type Toggle */}
                    <div className="login-toggle">
                        <button
                            type="button"
                            className={`toggle-btn ${identifierType === 'phone' ? 'active' : ''}`}
                            onClick={() => { setIdentifierType('phone'); setIdentifier(''); }}
                        >
                            📱 Telefone
                        </button>
                        <button
                            type="button"
                            className={`toggle-btn ${identifierType === 'email' ? 'active' : ''}`}
                            onClick={() => { setIdentifierType('email'); setIdentifier(''); }}
                        >
                            ✉️ Email
                        </button>
                    </div>

                    {/* Identifier Field */}
                    <div className="login-field">
                        <label>{identifierType === 'phone' ? 'Telefone' : 'Email'}</label>
                        <input
                            type={identifierType === 'email' ? 'email' : 'tel'}
                            placeholder={identifierType === 'phone' ? '(64) 99999-9999' : 'seu@email.com'}
                            value={identifier}
                            onChange={(e) => {
                                if (identifierType === 'phone') {
                                    setIdentifier(formatPhone(e.target.value));
                                } else {
                                    setIdentifier(e.target.value);
                                }
                            }}
                            disabled={loading}
                            autoComplete="current-password"
                        />
                    </div>

                    {/* Name Field (register only) */}
                    {mode === 'register' && (
                        <div className="login-field">
                            <label>Seu Nome</label>
                            <input
                                type="text"
                                placeholder="Nome completo"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={loading}
                                autoComplete="name"
                            />
                        </div>
                    )}

                    {/* Password */}
                    <div className="login-field">
                        <label>Senha</label>
                        <input
                            type="password"
                            placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Sua senha'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        />
                    </div>

                    {/* Confirm Password (register only) */}
                    {mode === 'register' && (
                        <div className="login-field">
                            <label>Confirmar Senha</label>
                            <input
                                type="password"
                                placeholder="Repita a senha"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={loading}
                                autoComplete="new-password"
                            />
                        </div>
                    )}

                    <button type="submit" className="btn btn-login" disabled={loading}>
                        {loading ? '⏳ Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar Conta'}
                    </button>
                </form>

                <div className="login-switch">
                    {mode === 'login' ? (
                        <p>
                            Não tem conta?{' '}
                            <button type="button" onClick={() => { setMode('register'); setError(null); }}>
                                Criar conta
                            </button>
                        </p>
                    ) : (
                        <p>
                            Já tem conta?{' '}
                            <button type="button" onClick={() => { setMode('login'); setError(null); }}>
                                Entrar
                            </button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
