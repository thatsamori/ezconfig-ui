-- Confirmed and Failed (online-platform#33). Times are milliseconds since the
-- Unix epoch, as in 0004.

-- When the poll that first reported the current `reported_live_configuration_id`
-- and `reported_result` arrived: the time a Live configuration became Confirmed
-- or Failed. NULL when they are NULL. A poll repeating the same report keeps
-- it; a different id or result, or a report of none, replaces it. The state
-- itself is computed from the report and the Live configuration, never stored.
ALTER TABLE game_servers ADD COLUMN reported_processed_at INTEGER;

-- Reports recorded before this column: the last poll written is the closest
-- time known.
UPDATE game_servers SET reported_processed_at = last_poll_at WHERE reported_live_configuration_id IS NOT NULL;
