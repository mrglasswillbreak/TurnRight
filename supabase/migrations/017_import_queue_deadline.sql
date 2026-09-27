-- Large, validated private import batches need more than the API's 8-second default.
-- Scope the bounded allowance to this service-only RPC; other requests retain their limits.
alter function public.queue_campus_import(uuid, uuid, jsonb, jsonb) set statement_timeout = '60s';
notify pgrst, 'reload schema';
