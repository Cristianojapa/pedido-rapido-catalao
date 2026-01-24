import type { CartItem } from './types';

const WHATSAPP_NUMBER = '5511952960701';
const STORE_NAME = 'Cristianojapa';

export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

export function generateWhatsAppMessage(items: CartItem[], storeName: string): string {
    const lines: string[] = [
        `🛒 *Pedido - ${STORE_NAME}*`,
        `📍 Loja: ${storeName}`,
        '',
        '*Itens do pedido:*',
    ];

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
    lines.push('');
    lines.push('_Mensagem gerada pelo catálogo online_');

    return lines.join('\n');
}

export function openWhatsApp(items: CartItem[], storeName: string): void {
    const message = generateWhatsAppMessage(items, storeName);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
    window.open(url, '_blank');
}
