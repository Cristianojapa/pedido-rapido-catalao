export interface Store {
  id: number;
  name: string;
  city?: string | null;
}

export interface Product {
  id: string;
  description: string;
  group: string | null;
  group_id: number;
  category: string | null;
  category_id: number;
  brand: string | null;
  brand_id: number;
  color: string | null;
  color_id: number;
  price: number;
  available: boolean;
  stock_quantity?: number;
}

export interface Filter {
  id: number;
  name: string;
}

export interface Filters {
  groups: Filter[];
  brands: Filter[];
  categories: Filter[];
  colors: Filter[];
}

export interface CatalogResponse {
  store: Pick<Store, 'id' | 'name'>;
  products: Product[];
  total: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface PublicOrderResponse {
  message: string;
  order_id: number | string;
  request_id?: number | string;
  total_value: number | string;
  items: PublicOrderItem[];
  status: string;
  idempotent?: boolean;
}

export interface PublicOrderItem {
  id?: number | string;
  product?: string;
  product_id?: string;
  quantity: number;
  product_description: string;
  unit_price: number | string;
  discount?: number | string;
  total_price: number | string;
}

export interface EmployeeUser {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_superuser: boolean;
  permissions: string[];
  allowed_stores: Store[];
}

export interface EmployeeSession {
  access: string;
  refresh: string;
  user: EmployeeUser;
}

export interface CustomerPortalUser {
  id: number;
  phone?: string | null;
  email?: string | null;
  name: string;
  linked_customer_id?: number | null;
  linked_customer_name?: string | null;
  has_statement_access: boolean;
  created_at?: string;
}

export interface CustomerSession {
  access: string;
  refresh: string;
  user: CustomerPortalUser;
}

export interface StatementMovement {
  date: string | null;
  type: string;
  description: string;
  debit: number | string;
  credit: number | string;
  running_balance: number | string;
  reference_id: number | string | null;
}

export interface CustomerStatement {
  customer_id: number | string;
  customer_name: string;
  phone: string;
  historical_debt: number | string;
  credit_balance: number | string;
  current_balance: number | string;
  previous_balance: number | string;
  movements: StatementMovement[];
}

export interface Customer {
  id: number | string;
  name: string;
  phone?: string | null;
  document?: string | null;
}

export interface Bank {
  id: number | string;
  name: string;
}

export type PaymentMethod =
  | 'CASH'
  | 'PIX'
  | 'DEBIT_CARD'
  | 'CREDIT_CARD'
  | 'PENDING';

export type OperationalRequestType = 'SALE' | 'WARRANTY_EXCHANGE' | 'RETURN';

export interface OperationalRequestItemInput {
  product_id: string;
  quantity: number;
  source_order_item?: number | string;
  defect?: string;
  notes?: string;
}

export interface OperationalRequestInput {
  type: OperationalRequestType;
  store: number;
  customer: number | string;
  items: OperationalRequestItemInput[];
  payment_method?: PaymentMethod;
  number_of_installments?: number;
  bank?: number | string | null;
  notes?: string;
  client_request_id?: string;
}

export interface OperationalRequestItem {
  id?: number | string;
  product?: string;
  product_id?: string;
  source_order_item?: number | string | null;
  quantity: number;
  product_description?: string;
  unit_price?: number | string;
  discount?: number | string;
  total_price?: number | string;
  defect?: string;
  notes?: string;
}

export interface OperationalRequest {
  id: number | string;
  type: OperationalRequestType;
  type_display?: string;
  status: string;
  status_display?: string;
  store?: number | Store;
  store_name?: string;
  customer?: number | string | Customer;
  customer_name?: string;
  submitted_by_name?: string;
  items?: OperationalRequestItem[];
  total_value?: number | string | null;
  status_reason?: string;
  printed_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  defective_received_at?: string | null;
  idempotent?: boolean;
  created_at: string;
}

export interface EligiblePurchaseItem {
  source_order_id: number | string;
  source_order_item_id: number | string;
  order_label: string;
  order_date: string | null;
  product_id: string;
  description: string;
  color: string | null;
  purchased_quantity: number;
  eligible_quantity: number;
}

export interface WarrantySelection {
  item: EligiblePurchaseItem;
  quantity: number;
  defect_description: string;
}
