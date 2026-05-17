CREATE INDEX idx_matches_user_a ON matches(user_a, created_at DESC);
CREATE INDEX idx_matches_user_b ON matches(user_b, created_at DESC);
