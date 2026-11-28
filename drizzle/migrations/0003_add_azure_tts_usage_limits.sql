CREATE TABLE public.tts_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  per_user_daily_chars integer NOT NULL DEFAULT 10000 CHECK (per_user_daily_chars > 0),
  per_user_monthly_chars integer NOT NULL DEFAULT 50000 CHECK (per_user_monthly_chars > 0),
  global_monthly_chars integer NOT NULL DEFAULT 400000 CHECK (global_monthly_chars > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tts_settings TO service_role;
ALTER TABLE public.tts_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.tts_settings (id) VALUES (true);

CREATE TABLE public.tts_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  chars integer NOT NULL CHECK (chars >= 0 AND chars <= 500),
  voice text NOT NULL,
  cached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tts_usage TO service_role;
ALTER TABLE public.tts_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX tts_usage_session_created_idx ON public.tts_usage (session_id, created_at DESC);
CREATE INDEX tts_usage_created_idx ON public.tts_usage (created_at DESC);

CREATE OR REPLACE FUNCTION public.prepare_tts(
  _session_id uuid,
  _chars integer,
  _voice text,
  _cached boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.tts_settings%rowtype;
  _requests integer;
  _daily_used integer;
  _monthly_used integer;
  _global_used integer;
  _usage_id uuid;
BEGIN
  IF _chars < 0 OR _chars > 500 OR (_cached AND _chars <> 0) THEN
    RAISE EXCEPTION 'INVALID_TTS_USAGE';
  END IF;

  SELECT * INTO _settings FROM public.tts_settings WHERE id = true FOR UPDATE;

  IF NOT _settings.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'disabled');
  END IF;

  SELECT count(*) INTO _requests
  FROM public.tts_usage
  WHERE session_id = _session_id AND created_at > now() - interval '1 minute';

  IF _requests >= 30 THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'rate_limited');
  END IF;

  IF NOT _cached THEN
    SELECT coalesce(sum(chars), 0) INTO _daily_used
    FROM public.tts_usage
    WHERE session_id = _session_id AND created_at >= date_trunc('day', now());

    IF _daily_used + _chars > _settings.per_user_daily_chars THEN
      RETURN jsonb_build_object('allowed', false, 'scope', 'user_daily');
    END IF;

    SELECT coalesce(sum(chars), 0) INTO _monthly_used
    FROM public.tts_usage
    WHERE session_id = _session_id AND created_at >= date_trunc('month', now());

    IF _monthly_used + _chars > _settings.per_user_monthly_chars THEN
      RETURN jsonb_build_object('allowed', false, 'scope', 'user_monthly');
    END IF;

    SELECT coalesce(sum(chars), 0) INTO _global_used
    FROM public.tts_usage
    WHERE created_at >= date_trunc('month', now());

    IF _global_used + _chars > _settings.global_monthly_chars THEN
      RETURN jsonb_build_object('allowed', false, 'scope', 'global');
    END IF;
  END IF;

  INSERT INTO public.tts_usage (session_id, chars, voice, cached)
  VALUES (_session_id, _chars, _voice, _cached)
  RETURNING id INTO _usage_id;

  RETURN jsonb_build_object('allowed', true, 'usage_id', _usage_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prepare_tts(uuid, integer, text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_tts(uuid, integer, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_tts_quota(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.tts_settings%rowtype;
  _daily_used integer;
  _monthly_used integer;
  _global_used integer;
BEGIN
  SELECT * INTO _settings FROM public.tts_settings WHERE id = true;
  IF NOT _settings.enabled THEN
    RETURN jsonb_build_object('available', false, 'scope', 'disabled');
  END IF;

  SELECT coalesce(sum(chars), 0) INTO _daily_used
  FROM public.tts_usage
  WHERE session_id = _session_id AND created_at >= date_trunc('day', now());
  IF _daily_used >= _settings.per_user_daily_chars THEN
    RETURN jsonb_build_object('available', false, 'scope', 'user_daily');
  END IF;

  SELECT coalesce(sum(chars), 0) INTO _monthly_used
  FROM public.tts_usage
  WHERE session_id = _session_id AND created_at >= date_trunc('month', now());
  IF _monthly_used >= _settings.per_user_monthly_chars THEN
    RETURN jsonb_build_object('available', false, 'scope', 'user_monthly');
  END IF;

  SELECT coalesce(sum(chars), 0) INTO _global_used
  FROM public.tts_usage
  WHERE created_at >= date_trunc('month', now());
  IF _global_used >= _settings.global_monthly_chars THEN
    RETURN jsonb_build_object('available', false, 'scope', 'global');
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'scope', null,
    'user_daily_remaining', greatest(0, _settings.per_user_daily_chars - _daily_used),
    'user_monthly_remaining', greatest(0, _settings.per_user_monthly_chars - _monthly_used),
    'global_remaining', greatest(0, _settings.global_monthly_chars - _global_used)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tts_quota(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tts_quota(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_tts_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.tts_settings%rowtype;
  _today_chars integer;
  _month_chars integer;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'staff') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO _settings FROM public.tts_settings WHERE id = true;
  SELECT coalesce(sum(chars), 0) INTO _today_chars FROM public.tts_usage WHERE created_at >= date_trunc('day', now());
  SELECT coalesce(sum(chars), 0) INTO _month_chars FROM public.tts_usage WHERE created_at >= date_trunc('month', now());

  RETURN jsonb_build_object(
    'settings', to_jsonb(_settings),
    'today_chars', _today_chars,
    'month_chars', _month_chars,
    'global_remaining', greatest(0, _settings.global_monthly_chars - _month_chars),
    'per_user', coalesce((
      SELECT jsonb_agg(row_data ORDER BY month_chars DESC)
      FROM (
        SELECT jsonb_build_object(
          'session_id', session_id,
          'today_chars', sum(chars) FILTER (WHERE created_at >= date_trunc('day', now())),
          'month_chars', sum(chars),
          'requests', count(*),
          'cached_requests', count(*) FILTER (WHERE cached)
        ) AS row_data,
        sum(chars) AS month_chars
        FROM public.tts_usage
        WHERE created_at >= date_trunc('month', now())
        GROUP BY session_id
        ORDER BY sum(chars) DESC
        LIMIT 30
      ) stats
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tts_admin_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_tts_admin_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_tts_settings(
  _enabled boolean,
  _daily integer,
  _monthly integer,
  _global integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'staff') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _daily <= 0 OR _monthly <= 0 OR _global <= 0 THEN
    RAISE EXCEPTION 'INVALID_LIMITS';
  END IF;
  UPDATE public.tts_settings
  SET enabled = _enabled,
      per_user_daily_chars = _daily,
      per_user_monthly_chars = _monthly,
      global_monthly_chars = _global,
      updated_at = now()
  WHERE id = true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_tts_settings(boolean, integer, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_tts_settings(boolean, integer, integer, integer) TO authenticated, service_role;
