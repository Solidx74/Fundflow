// Shared, atomic limiter (rate_hit in 0003). Fails closed: if the check errors, the request is limited.
export async function limited(db, key, limit, secs) {
  const { data, error } = await db.rpc("rate_hit", { p_key: key, p_limit: limit, p_window_seconds: secs });
  return !!error || data === false;
}
