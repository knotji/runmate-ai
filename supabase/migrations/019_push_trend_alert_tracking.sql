-- Separate idempotency tracking for trend-alert push notifications (see
-- send-trend-alerts cron route), independent of last_sent_date_key and
-- last_race_reminder_date_key which track the other two notification types —
-- reusing either would let one notification type's send suppress this one's.
alter table public.push_subscriptions
  add column if not exists last_trend_alert_date_key text null;
