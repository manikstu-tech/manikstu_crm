export interface Order {
  id: string;
  customer: string;
  location: string;
  product: string;
  amount: number;
  status: 'Delivered' | 'In transit' | 'Confirmed' | 'Payment pending' | 'Cancelled';
  paymentStatus: 'Paid' | 'Pending' | 'Refunded';
  date: string;
}

export interface Lead {
  id: string;
  name: string;
  action: string;
  when: string;
  urgency: 'high' | 'medium' | 'low';
}

export interface Enquiry {
  id: string;
  name: string;
  interestedIn: string;
  source: string;
  assignedTo: string;
  status: 'New' | 'In progress' | 'Converted' | 'Closed';
  received: string;
}

export interface Customer {
  id: string;
  name: string;
  location: string;
  ordersCount: number;
  lifetimeValue: number;
  lastOrder: string;
  status: 'Active' | 'New' | 'Inactive';
  phone: string;
  landHolding: string;
  crops: string[];
  livestock: {
    cows: number;
    buffaloes: number;
    goats: number;
    sheep: number;
    poultry: number;
  };
  /** Free-text farm-profile fields the telecalling head can fill in from a call. */
  details?: {
    farmingModel?: string;
    waterResource?: string;
    preferredLanguage?: string;
  };
}

export interface Product {
  id: string;
  name: string;
  category: 'Seeds' | 'Fertilizer & soil' | 'Crop protection' | 'Oils & produce' | 'Equipment';
  price: string;
  icon: string;
  stockStatus: 'In stock' | 'Low stock' | 'Out of stock';
  quantity: number;
}

export interface Franchise {
  id: string;
  name: string;
  location: string;
  owner: string;
  ordersThisMonth: number;
  revenue: string;
  status: 'Active' | 'Onboarding';
}

export interface FPO {
  id: string;
  name: string;
  location: string;
  members: number;
  primaryCrop: string;
  status: 'Active' | 'Onboarding';
}

export interface Transaction {
  id: string;
  type: string;
  party: string;
  amount: number;
  status: 'Settled' | 'Pending' | 'Processing';
  date: string;
}

export const INITIAL_ORDERS: Order[] = [
  { id: 'MK-2461', customer: 'Debasish Nayak', location: 'Cuttack', product: 'Swarna paddy seed, 20kg', amount: 2400, status: 'Delivered', paymentStatus: 'Paid', date: '18 Sep' },
  { id: 'MK-2460', customer: 'Snehalata Behera', location: 'Puri', product: 'Cold-pressed mustard oil', amount: 1150, status: 'In transit', paymentStatus: 'Paid', date: '18 Sep' },
  { id: 'MK-2459', customer: 'Rakesh Sahoo', location: 'Balasore', product: 'Vermicompost, 50kg', amount: 980, status: 'Confirmed', paymentStatus: 'Paid', date: '17 Sep' },
  { id: 'MK-2458', customer: 'Manoj Mallick', location: 'Baripada', product: 'Vegetable seed kit', amount: 640, status: 'Payment pending', paymentStatus: 'Pending', date: '17 Sep' },
  { id: 'MK-2457', customer: 'Priyanka Patra', location: 'Bhubaneswar', product: 'Organic turmeric powder', amount: 520, status: 'Delivered', paymentStatus: 'Paid', date: '16 Sep' },
  { id: 'MK-2456', customer: 'Suresh Jena', location: 'Mayurbhanj', product: 'Neem-based pesticide', amount: 410, status: 'Delivered', paymentStatus: 'Paid', date: '16 Sep' },
  { id: 'MK-2455', customer: 'Ipsita Rout', location: 'Ganjam', product: 'Drip irrigation kit', amount: 3200, status: 'In transit', paymentStatus: 'Paid', date: '15 Sep' },
  { id: 'MK-2454', customer: 'Bikram Dash', location: 'Khordha', product: 'Certified wheat seed, 25kg', amount: 1780, status: 'Cancelled', paymentStatus: 'Refunded', date: '14 Sep' }
];

export const INITIAL_LEADS: Lead[] = [
  { id: 'L-101', name: 'Suresh Jena', action: 'Wants pricing on drip irrigation kit', when: 'Due 2:30 PM', urgency: 'high' },
  { id: 'L-102', name: 'Ipsita Rout', action: 'Confirm delivery address, Ganjam', when: 'Due 4:00 PM', urgency: 'medium' },
  { id: 'L-103', name: 'Bikram Dash', action: 'Follow up on bulk seed enquiry', when: 'Tomorrow', urgency: 'low' },
  { id: 'L-104', name: 'Lopamudra Sethi', action: 'Re-call — no answer twice', when: 'Tomorrow', urgency: 'medium' }
];

export const INITIAL_ENQUIRIES: Enquiry[] = [
  { id: 'ENQ-341', name: 'Ananta Behera', interestedIn: 'Drip irrigation setup', source: 'Website', assignedTo: 'Ananya Mishra', status: 'New', received: 'Today' },
  { id: 'ENQ-340', name: 'Subhashree Mallick', interestedIn: 'Bulk paddy seed', source: 'WhatsApp', assignedTo: 'Bikram Rout', status: 'In progress', received: 'Today' },
  { id: 'ENQ-339', name: 'Ramesh Patra', interestedIn: 'Organic fertilizer', source: 'Referral', assignedTo: 'Ananya Mishra', status: 'Converted', received: 'Yesterday' },
  { id: 'ENQ-338', name: 'Kanhu Sahoo', interestedIn: 'Franchise enquiry', source: 'Walk-in', assignedTo: 'Sujata Swain', status: 'In progress', received: 'Yesterday' },
  { id: 'ENQ-337', name: 'Debjani Rout', interestedIn: 'Vegetable seed kit', source: 'Website', assignedTo: 'Ananya Mishra', status: 'Closed', received: '2 days ago' },
  { id: 'ENQ-336', name: 'Ashok Nayak', interestedIn: 'FPO partnership', source: 'Referral', assignedTo: 'Bikram Rout', status: 'New', received: '2 days ago' }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'C-001', name: 'Debasish Nayak', location: 'Cuttack', ordersCount: 14, lifetimeValue: 18600, lastOrder: '18 Sep', status: 'Active',
    phone: '98610 24810', landHolding: '4.5 acres', crops: ['Paddy', 'Vegetables'],
    livestock: { cows: 4, buffaloes: 2, goats: 8, sheep: 0, poultry: 25 }
  },
  {
    id: 'C-002', name: 'Snehalata Behera', location: 'Puri', ordersCount: 6, lifetimeValue: 7200, lastOrder: '18 Sep', status: 'Active',
    phone: '94371 99201', landHolding: '2.0 acres', crops: ['Mustard', 'Sesame'],
    livestock: { cows: 2, buffaloes: 0, goats: 4, sheep: 0, poultry: 12 }
  },
  {
    id: 'C-003', name: 'Rakesh Sahoo', location: 'Balasore', ordersCount: 3, lifetimeValue: 2940, lastOrder: '17 Sep', status: 'Active',
    phone: '97782 11043', landHolding: '3.2 acres', crops: ['Paddy', 'Pulses'],
    livestock: { cows: 1, buffaloes: 1, goats: 6, sheep: 0, poultry: 10 }
  },
  {
    id: 'C-004', name: 'Manoj Mallick', location: 'Baripada', ordersCount: 1, lifetimeValue: 640, lastOrder: '17 Sep', status: 'New',
    phone: '89172 44320', landHolding: '1.5 acres', crops: ['Vegetables'],
    livestock: { cows: 2, buffaloes: 0, goats: 2, sheep: 0, poultry: 5 }
  },
  {
    id: 'C-005', name: 'Priyanka Patra', location: 'Bhubaneswar', ordersCount: 9, lifetimeValue: 11300, lastOrder: '16 Sep', status: 'Active',
    phone: '99370 88219', landHolding: '5.0 acres', crops: ['Turmeric', 'Spices', 'Paddy'],
    livestock: { cows: 3, buffaloes: 2, goats: 10, sheep: 0, poultry: 30 }
  },
  {
    id: 'C-006', name: 'Suresh Jena', location: 'Mayurbhanj', ordersCount: 2, lifetimeValue: 1890, lastOrder: '3 months ago', status: 'Inactive',
    phone: '91244 55109', landHolding: '2.8 acres', crops: ['Paddy'],
    livestock: { cows: 1, buffaloes: 0, goats: 3, sheep: 0, poultry: 8 }
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  { id: 'P-1', name: 'Swarna Paddy Seed', category: 'Seeds', price: '₹120/kg', icon: '🌾', stockStatus: 'In stock', quantity: 340 },
  { id: 'P-2', name: 'Vegetable Seed Kit', category: 'Seeds', price: '₹640/kit', icon: '🌱', stockStatus: 'In stock', quantity: 120 },
  { id: 'P-3', name: 'Vermicompost Fertilizer', category: 'Fertilizer & soil', price: '₹380/50kg', icon: '🌿', stockStatus: 'Low stock', quantity: 18 },
  { id: 'P-4', name: 'Neem-based Pesticide', category: 'Crop protection', price: '₹410/L', icon: '🧪', stockStatus: 'In stock', quantity: 85 },
  { id: 'P-5', name: 'Cold-Pressed Mustard Oil', category: 'Oils & produce', price: '₹1,150/5L', icon: '🫒', stockStatus: 'Low stock', quantity: 9 },
  { id: 'P-6', name: 'Drip Irrigation Kit', category: 'Equipment', price: '₹3,200/set', icon: '💧', stockStatus: 'In stock', quantity: 45 },
  { id: 'P-7', name: 'Mustard Seed', category: 'Seeds', price: '₹95/kg', icon: '🌻', stockStatus: 'In stock', quantity: 190 },
  { id: 'P-8', name: 'Organic Turmeric Powder', category: 'Oils & produce', price: '₹520/pack', icon: '🧴', stockStatus: 'In stock', quantity: 210 }
];

export const INITIAL_FRANCHISES: Franchise[] = [
  { id: 'FR-1', name: 'Manikstu Agri Hub', location: 'Cuttack', owner: 'Bikram Rout', ordersThisMonth: 210, revenue: '₹1.4L', status: 'Active' },
  { id: 'FR-2', name: 'Manikstu Agri Hub', location: 'Berhampur', owner: 'Lopamudra Sethi', ordersThisMonth: 178, revenue: '₹1.1L', status: 'Active' },
  { id: 'FR-3', name: 'Manikstu Agri Hub', location: 'Balasore', owner: 'Ashok Nayak', ordersThisMonth: 145, revenue: '₹96K', status: 'Active' },
  { id: 'FR-4', name: 'Manikstu Agri Hub', location: 'Puri', owner: 'Debjani Rout', ordersThisMonth: 132, revenue: '₹88K', status: 'Active' },
  { id: 'FR-5', name: 'Manikstu Agri Hub', location: 'Rourkela', owner: 'Suresh Jena', ordersThisMonth: 96, revenue: '₹61K', status: 'Active' },
  { id: 'FR-6', name: 'Manikstu Agri Hub', location: 'Sambalpur', owner: 'Pending Assignment', ordersThisMonth: 0, revenue: '—', status: 'Onboarding' }
];

export const INITIAL_FPOS: FPO[] = [
  { id: 'FPO-1', name: "Mayurbhanj Farmers' Producer Org.", location: 'Baripada', members: 420, primaryCrop: 'Paddy', status: 'Onboarding' },
  { id: 'FPO-2', name: 'Ganjam Agri Producer Co.', location: 'Berhampur', members: 610, primaryCrop: 'Vegetables', status: 'Active' },
  { id: 'FPO-3', name: 'Balasore Farmers Collective', location: 'Balasore', members: 385, primaryCrop: 'Mustard', status: 'Active' }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: 'TX-901', type: 'Order payment', party: 'Debasish Nayak', amount: 2400, status: 'Settled', date: 'Today, 10:15 AM' },
  { id: 'TX-902', type: 'Franchise payout', party: 'Cuttack Hub', amount: 42000, status: 'Pending', date: 'Today, 09:30 AM' },
  { id: 'TX-903', type: 'Refund', party: 'Manoj Mallick', amount: 640, status: 'Processing', date: 'Yesterday' },
  { id: 'TX-904', type: 'FPO settlement', party: 'Ganjam Agri Producer Co.', amount: 110000, status: 'Settled', date: '22 Sep' }
];
