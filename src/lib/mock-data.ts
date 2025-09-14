// Mock data for the admin dashboard prototype
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'NOC' | 'Finance' | 'Care' | 'Tech' | 'Warehouse' | 'ReadOnly';
  avatar?: string;
  lastLogin: string;
  status: 'active' | 'inactive';
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  joinDate: string;
  status: 'active' | 'suspended' | 'disconnected';
  subscriptions: Subscription[];
  tickets: Ticket[];
  invoices: Invoice[];
}

export interface Subscription {
  id: string;
  customerId: string;
  planName: string;
  speed: string;
  price: number;
  status: 'active' | 'suspended' | 'cancelled';
  startDate: string;
  nextBilling: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  amount: number;
  status: 'paid' | 'overdue' | 'draft' | 'pending';
  dueDate: string;
  createdDate: string;
}

export interface Ticket {
  id: string;
  customerId: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'technical' | 'billing' | 'general';
  createdDate: string;
  slaDeadline: string;
  assignee?: string;
}

export interface NetworkDevice {
  id: string;
  name: string;
  type: 'router' | 'switch' | 'ap' | 'olt' | 'onu';
  location: string;
  status: 'online' | 'offline' | 'warning';
  uptime: number;
  lastSeen: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  minStock: number;
  price: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
  lastUpdated: string;
  loanable: boolean;
  onLoan: number;
  totalUnits: number;
}

export interface LoanItem {
  id: string;
  inventoryItemId: string;
  customerId: string;
  customerName: string;
  serialNumber: string;
  loanDate: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  status: 'on-loan' | 'returned' | 'overdue';
  condition: 'new' | 'good' | 'fair' | 'damaged';
}

// Mock users
export const mockUsers: User[] = [
  {
    id: '1',
    name: 'John Admin',
    email: 'john@weonet.com',
    role: 'Admin',
    lastLogin: '2024-01-15T10:30:00Z',
    status: 'active'
  },
  {
    id: '2',
    name: 'Sarah NOC',
    email: 'sarah@weonet.com',
    role: 'NOC',
    lastLogin: '2024-01-15T09:15:00Z',
    status: 'active'
  },
  {
    id: '3',
    name: 'Mike Finance',
    email: 'mike@weonet.com',
    role: 'Finance',
    lastLogin: '2024-01-14T16:45:00Z',
    status: 'active'
  }
];

// Mock customers
export const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'Tech Corp Solutions',
    email: 'admin@techcorp.com',
    phone: '+1-555-0123',
    address: '123 Business Ave, Tech City, TC 12345',
    joinDate: '2023-06-15',
    status: 'active',
    subscriptions: [],
    tickets: [],
    invoices: []
  },
  {
    id: '2',
    name: 'Creative Studios LLC',
    email: 'info@creativestudios.com',
    phone: '+1-555-0124',
    address: '456 Design St, Art District, AD 67890',
    joinDate: '2023-08-22',
    status: 'active',
    subscriptions: [],
    tickets: [],
    invoices: []
  }
];

// Mock subscriptions
export const mockSubscriptions: Subscription[] = [
  {
    id: '1',
    customerId: '1',
    planName: 'Business Pro 500',
    speed: '500/100 Mbps',
    price: 299.99,
    status: 'active',
    startDate: '2023-06-15',
    nextBilling: '2024-02-15'
  },
  {
    id: '2',
    customerId: '2',
    planName: 'Creative Plus 200',
    speed: '200/50 Mbps',
    price: 149.99,
    status: 'active',
    startDate: '2023-08-22',
    nextBilling: '2024-02-22'
  }
];

// Mock invoices
export const mockInvoices: Invoice[] = [
  {
    id: 'INV-001',
    customerId: '1',
    amount: 299.99,
    status: 'paid',
    dueDate: '2024-01-15',
    createdDate: '2024-01-01'
  },
  {
    id: 'INV-002',
    customerId: '2',
    amount: 149.99,
    status: 'overdue',
    dueDate: '2024-01-10',
    createdDate: '2023-12-27'
  },
  {
    id: 'INV-003',
    customerId: '1',
    amount: 299.99,
    status: 'draft',
    dueDate: '2024-02-15',
    createdDate: '2024-01-15'
  }
];

// Mock tickets
export const mockTickets: Ticket[] = [
  {
    id: 'TCK-001',
    customerId: '1',
    title: 'Internet connection intermittent',
    description: 'Customer reports intermittent connectivity issues during peak hours',
    status: 'open',
    priority: 'high',
    category: 'technical',
    createdDate: '2024-01-14T09:00:00Z',
    slaDeadline: '2024-01-16T09:00:00Z',
    assignee: 'Sarah NOC'
  },
  {
    id: 'TCK-002',
    customerId: '2',
    title: 'Billing inquiry - invoice discrepancy',
    description: 'Customer questions charges on last month invoice',
    status: 'in-progress',
    priority: 'medium',
    category: 'billing',
    createdDate: '2024-01-13T14:30:00Z',
    slaDeadline: '2024-01-17T14:30:00Z',
    assignee: 'Mike Finance'
  }
];

// Mock network devices
export const mockNetworkDevices: NetworkDevice[] = [
  {
    id: '1',
    name: 'Core-Router-01',
    type: 'router',
    location: 'Data Center A',
    status: 'online',
    uptime: 99.8,
    lastSeen: '2024-01-15T11:00:00Z'
  },
  {
    id: '2',
    name: 'Access-Switch-42',
    type: 'switch',
    location: 'Tower Site B',
    status: 'warning',
    uptime: 97.2,
    lastSeen: '2024-01-15T10:45:00Z'
  },
  {
    id: '3',
    name: 'OLT-Downtown-01',
    type: 'olt',
    location: 'Downtown POP',
    status: 'offline',
    uptime: 0,
    lastSeen: '2024-01-15T08:30:00Z'
  }
];

// Mock inventory
export const mockInventory: InventoryItem[] = [
  {
    id: '1',
    name: 'Single Mode Fiber Optic Cable - 1000ft',
    sku: 'FIB-SM-1000',
    category: 'Fiber Optic',
    stock: 25,
    minStock: 10,
    price: 299.99,
    status: 'in-stock',
    lastUpdated: '2024-01-15',
    loanable: false,
    onLoan: 0,
    totalUnits: 25
  },
  {
    id: '2',
    name: 'Multi Mode Fiber Optic Cable - 500ft',
    sku: 'FIB-MM-500',
    category: 'Fiber Optic',
    stock: 18,
    minStock: 8,
    price: 199.99,
    status: 'in-stock',
    lastUpdated: '2024-01-15',
    loanable: false,
    onLoan: 0,
    totalUnits: 18
  },
  {
    id: '3',
    name: 'Customer Premises Router - Wi-Fi 6',
    sku: 'RTR-CPE-W6',
    category: 'Routers',
    stock: 32,
    minStock: 20,
    price: 159.99,
    status: 'in-stock',
    lastUpdated: '2024-01-14',
    loanable: true,
    onLoan: 45,
    totalUnits: 77
  },
  {
    id: '4',
    name: 'Enterprise Router - Dual WAN',
    sku: 'RTR-ENT-DW',
    category: 'Routers',
    stock: 5,
    minStock: 8,
    price: 499.99,
    status: 'low-stock',
    lastUpdated: '2024-01-13',
    loanable: true,
    onLoan: 12,
    totalUnits: 17
  },
  {
    id: '5',
    name: 'Optical Network Terminal (ONT) - Residential',
    sku: 'ONT-RES-001',
    category: 'ONT',
    stock: 28,
    minStock: 25,
    price: 149.99,
    status: 'in-stock',
    lastUpdated: '2024-01-15',
    loanable: true,
    onLoan: 67,
    totalUnits: 95
  },
  {
    id: '6',
    name: 'Optical Network Terminal (ONT) - Business',
    sku: 'ONT-BUS-001',
    category: 'ONT',
    stock: 12,
    minStock: 15,
    price: 249.99,
    status: 'low-stock',
    lastUpdated: '2024-01-14',
    loanable: true,
    onLoan: 23,
    totalUnits: 35
  },
  {
    id: '7',
    name: 'Optical Network Unit (ONU) - GPON',
    sku: 'ONU-GPON-001',
    category: 'ONU',
    stock: 0,
    minStock: 10,
    price: 89.99,
    status: 'out-of-stock',
    lastUpdated: '2024-01-12',
    loanable: true,
    onLoan: 15,
    totalUnits: 15
  },
  {
    id: '8',
    name: 'SC/APC Fiber Connectors - 50 Pack',
    sku: 'CON-SCAPC-50',
    category: 'Connectors',
    stock: 156,
    minStock: 100,
    price: 89.99,
    status: 'in-stock',
    lastUpdated: '2024-01-15',
    loanable: false,
    onLoan: 0,
    totalUnits: 156
  },
  {
    id: '9',
    name: 'LC/UPC Fiber Connectors - 25 Pack',
    sku: 'CON-LCUPC-25',
    category: 'Connectors',
    stock: 67,
    minStock: 50,
    price: 49.99,
    status: 'in-stock',
    lastUpdated: '2024-01-14',
    loanable: false,
    onLoan: 0,
    totalUnits: 67
  },
  {
    id: '10',
    name: 'FC/PC Fiber Connectors - 10 Pack',
    sku: 'CON-FCPC-10',
    category: 'Connectors',
    stock: 23,
    minStock: 30,
    price: 34.99,
    status: 'low-stock',
    lastUpdated: '2024-01-13',
    loanable: false,
    onLoan: 0,
    totalUnits: 23
  }
];

// Mock loan items
export const mockLoanItems: LoanItem[] = [
  {
    id: '1',
    inventoryItemId: '3',
    customerId: '1',
    customerName: 'Tech Corp Solutions',
    serialNumber: 'RTR-001234',
    loanDate: '2023-06-15',
    status: 'on-loan',
    condition: 'good'
  },
  {
    id: '2',
    inventoryItemId: '5',
    customerId: '2',
    customerName: 'Creative Studios LLC',
    serialNumber: 'ONT-005678',
    loanDate: '2023-08-22',
    status: 'on-loan',
    condition: 'good'
  },
  {
    id: '3',
    inventoryItemId: '7',
    customerId: '1',
    customerName: 'Tech Corp Solutions',
    serialNumber: 'ONU-009876',
    loanDate: '2023-12-10',
    expectedReturnDate: '2024-01-10',
    status: 'overdue',
    condition: 'fair'
  }
];