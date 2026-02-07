import type { CartItem } from './types';
import { api } from './api';

const WHATSAPP_NUMBER = '5564999194800';

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

export async function openWhatsApp(items: CartItem[], storeName: string, storeId: number): Promise<void> {
    let orderId: number | undefined;

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
        const response = await api.createOrder(orderData);
        orderId = response.order_id;
        console.log('Pedido enviado para o sistema com sucesso! ID:', orderId);
    } catch (error) {
        console.error('Erro ao enviar pedido para o sistema:', error);
        // Continua para abrir o WhatsApp mesmo se falhar
    }

    const message = generateWhatsAppMessage(items, storeName, orderId);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;

    window.open(url, '_blank');
}
