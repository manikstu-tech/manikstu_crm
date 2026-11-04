// Sellers who list their products on Manikstu. Sample data: the backend has no sellers
// table yet, and products have no seller column, so which seller owns which catalogue
// product (by product id in catalogProducts.ts) is set here.

export interface Seller {
  id: number;
  /** Login that belongs to this seller (lib/users.ts). */
  userId: string;
  staffId?: string;
  dbUserId?: string;
  business: string;
  owner: string;
  city: string;
  gstin: string;
  /** Manikstu's commission on each sale, in percent. */
  commissionPct: number;
  /** Delivered orders are paid out this many days after delivery. */
  payoutAfterDays: number;
  productIds: number[];
}

export const SELLERS: Seller[] = [
  {
    id: 1,
    userId: 'u-sl-301',
    staffId: 'MK-SL-301',
    dbUserId: '3',
    business: 'Manikstu Agro Pvt Ltd',
    owner: 'Sanjay Rath',
    city: 'Bhubaneswar',
    gstin: '21AAJCM6881B1ZM',
    commissionPct: 12,
    payoutAfterDays: 7,
    // Central inventory: this single seller owns the whole catalogue.
    productIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  },
];

export const sellerForUser = (
  userIdOrUser: string | { id?: string; staffId?: string; name?: string },
  staffId?: string,
  name?: string
) => {
  const uid = typeof userIdOrUser === 'string' ? userIdOrUser : userIdOrUser?.id;
  const sid = (typeof userIdOrUser === 'object' ? userIdOrUser?.staffId : staffId) ?? '';
  const uName = (typeof userIdOrUser === 'object' ? userIdOrUser?.name : name) ?? '';

  return SELLERS.find(s =>
    (uid && (s.userId === uid || s.staffId === uid || s.dbUserId === uid)) ||
    (sid && (s.staffId === sid || s.userId === sid || (sid.includes('301') && s.id === 1) || (sid.includes('302') && s.id === 2))) ||
    (uName && s.owner.toLowerCase() === uName.toLowerCase()) ||
    (uid === '3' && s.id === 1)
  );
};

