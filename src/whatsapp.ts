import type { CartItem } from './types';
import { api } from './api';

// Número de WhatsApp - configurável via variável de ambiente
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '5564999194800';

console.log('WhatsApp number:', WHATSAPP_NUMBER);

export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

export function generateWhatsAppMessage(items: CartItem[], storeName: string, orderId?: number): string {
    const lines: string[] = [];

    if (orderId) {
        lines.push(`🛒 *Pedido #${orderId}*`);
    } else {
        lines.push(`🛒 *Novo Pedido*`);
    }

    lines.push(`📍 Loja: ${storeName}`);
    lines.push('');
    lines.push('*Itens do pedido:*');

    let total = 0;

    items.forEach((item, index) => {
        const subtotal = item.product.price * item.quantity;
        total += subtotal;
        lines.push(
            `${index + 1}. ${item.product.description}`,
            `   Qtd: ${item.quantity} x ${formatCurrency(item.product.price)} = ${formatCurrency(subtotal)}`,
            ''
        );
    });

    lines.push('─'.repeat(30));
    lines.push(`*TOTAL: ${formatCurrency(total)}*`);

    return lines.join('\n');
}

export interface OpenWhatsAppResult {
    success: boolean;
    orderId?: number;
    error?: string;
}

export async function openWhatsApp(items: CartItem[], storeName: string, storeId: number): Promise<OpenWhatsAppResult> {
    let orderId: number | undefined;
    let orderError: string | undefined;

    // Envia o pedido para o sistema antes de abrir o WhatsApp
    try {
        const orderData = {
            store: storeId,
            items: items.map(item => ({
                product_id: item.product.id,
                description: item.product.description,
                quantity: item.quantity,
                price: item.product.price,
            })),
        };
        console.log('Enviando pedido para API:', JSON.stringify(orderData));
        const response = await api.createOrder(orderData);
        orderId = response.order_id;
        console.log('Pedido criado com sucesso! ID:', orderId);
    } catch (error) {
        console.error('Erro ao enviar pedido para o sistema:', error);
        orderError = error instanceof Error ? error.message : 'Erro desconhecido';
        // Continua para abrir o WhatsApp mesmo se falhar no sistema
    }

    const message = generateWhatsAppMessage(items, storeName, orderId);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;

    // No celular, usamos window.location.href que funciona melhor
    // Em desktop, tentamos window.open primeiro
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        // Em mobile, redireciona diretamente para WhatsApp
        window.location.href = url;
    } else {
        // Em desktop, tenta abrir em nova aba
        const newWindow = window.open(url, '_blank');
        if (!newWindow) {
            // Se popup foi bloqueada, redireciona
            window.location.href = url;
        }
    }

    return {
        success: orderId !== undefined,
        orderId,
        error: orderError,
    };
}
