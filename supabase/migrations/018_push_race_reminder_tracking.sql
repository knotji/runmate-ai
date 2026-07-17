-- Separate idempotency tracking for race-countdown push notifications (see
-- send-race-countdown cron route), independent of last_sent_date_key which
-- tracks the unrelated daily "haven't logged today" reminder — reusing that
-- column would let one notification type's send suppress the other's.
alter table public.push_subscriptions
  add column if not exists last_race_reminder_date_key text null;
