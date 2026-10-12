export type AccountType = 'clabe' | 'card' | 'both';

export interface AssignedGiveaway {
  id: number;
  is_active: number;
  title: string;
  uuid: string;
}

export interface BankAccount {
  account_holder: string;
  account_number: string | null;
  account_type: AccountType;
  bank_name: string;
  card_number: string | null;
  clabe: string | null;
  created_at: string;
  currency: string;
  giveaways?: AssignedGiveaway[];
  id: number;
  is_active: number;
  updated_at: string;
  uuid: string;
}

export interface CreateBankAccountInput {
  account_holder: string;
  account_number?: string | null;
  account_type: AccountType;
  bank_name: string;
  card_number?: string | null;
  clabe?: string | null;
  currency?: string;
  giveaway_ids?: number[];
  is_active?: boolean;
}

export interface UpdateBankAccountInput {
  account_holder?: string;
  account_number?: string | null;
  account_type?: AccountType;
  bank_name?: string;
  card_number?: string | null;
  clabe?: string | null;
  currency?: string;
  giveaway_ids?: number[];
  is_active?: boolean;
}

export interface GiveawayOption {
  id: number;
  slug: string;
  status: string;
  title: string;
  uuid: string;
}
