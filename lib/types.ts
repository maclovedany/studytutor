// 코치링 도메인 타입 (PRD 11장 스키마 대응)

export type Role = "user" | "admin";
export type Tier = "free" | "paid";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  tier: Tier;
  phone: string | null;
  phone_verified_at: string | null;
  created_at: string;
}

export interface PointPolicy {
  id: string;
  policy_key: string;
  name: string;
  points: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PointEvent {
  id: string;
  user_id: string;
  policy_key: string | null;
  points: number;
  reason: string | null;
  related_user_id: string | null;
  created_at: string;
}

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  is_active: boolean;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string | null;
  created_at: string;
}

export interface PhoneVerification {
  id: string;
  user_id: string;
  phone: string;
  code: string;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

export type MessageStatus = "pending" | "sent" | "failed";

export interface MessageJob {
  id: string;
  user_id: string;
  channel: string;
  template_key: string | null;
  message: string | null;
  scheduled_at: string | null;
  status: MessageStatus;
  sent_at: string | null;
  created_at: string;
}

export type ConsultationStatus =
  | "reserved"
  | "started"
  | "payment_required"
  | "paid"
  | "resumed"
  | "completed";

export interface Consultation {
  id: string;
  user_id: string;
  zoom_url: string | null;
  zoom_meeting_id: string | null;
  zoom_password: string | null;
  status: ConsultationStatus;
  reserved_at: string;
  started_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type PaymentStatus = "pending" | "paid" | "failed" | "canceled";

export interface Payment {
  id: string;
  user_id: string;
  consultation_id: string | null;
  amount: number;
  status: PaymentStatus;
  payment_provider: string;
  paid_at: string | null;
  created_at: string;
}
