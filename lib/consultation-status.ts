import type { ConsultationStatus } from "./types";

/** 상담 상태 한글 라벨 + 배지 톤 */
export const consultationStatusLabel: Record<ConsultationStatus, string> = {
  reserved: "예약됨",
  started: "상담 시작",
  payment_required: "결제 필요",
  paid: "결제 완료",
  resumed: "상담 재개",
  completed: "상담 종료",
};

export const consultationStatusTone: Record<
  ConsultationStatus,
  "slate" | "blue" | "amber" | "green"
> = {
  reserved: "slate",
  started: "blue",
  payment_required: "amber",
  paid: "green",
  resumed: "green",
  completed: "slate",
};
