CREATE OR REPLACE FUNCTION chat_previews(p_viewer_id uuid)
RETURNS TABLE (
  chat_id uuid,
  last_message_type text,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS chat_id,
    lm.type::text AS last_message_type,
    lm.content AS last_message_content,
    lm.sender_id AS last_message_sender_id,
    lm.created_at AS last_message_created_at,
    COALESCE(uc.cnt, 0) AS unread_count
  FROM chats c
  JOIN matches m ON m.id = c.match_id
  LEFT JOIN LATERAL (
    SELECT type, content, sender_id, created_at
    FROM messages
    WHERE messages.chat_id = c.id
      AND messages.deleted_at IS NULL
    ORDER BY messages.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM messages
    WHERE messages.chat_id = c.id
      AND messages.sender_id <> p_viewer_id
      AND messages.read_at IS NULL
      AND messages.deleted_at IS NULL
  ) uc ON true
  WHERE (m.user_a = p_viewer_id OR m.user_b = p_viewer_id);
$$;
