-- Zoom 임베드: 예약 시 생성한 실제 미팅 식별자 저장 (없으면 데모 링크 전용 상담)
alter table consultations add column if not exists zoom_meeting_id text;
alter table consultations add column if not exists zoom_password text;
