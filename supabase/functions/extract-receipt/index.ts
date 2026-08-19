import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  getFirstPublishableKey,
  processReceiptImage,
} from '../_shared/receipt-processing.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey =
    req.headers.get('apikey') ??
    getFirstPublishableKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')) ??
    Deno.env.get('SUPABASE_ANON_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const openAiModel = Deno.env.get('OPENAI_RECEIPT_MODEL') ?? 'gpt-5.4-mini';

  if (!supabaseUrl || !supabaseKey || !openAiApiKey) {
    return jsonResponse({ error: 'Missing Edge Function secrets' }, 500);
  }

  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authenticated user token' }, 401);
  }

  const receiptId = await readReceiptId(req);

  if (!receiptId) {
    return jsonResponse({ error: 'receipt_id is required' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
  const jwt = authorization.replace('Bearer ', '');
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: userError?.message ?? 'Invalid user token' }, 401);
  }

  try {
    const result = await processReceiptImage(supabase, {
      expectedOwnerId: user.id,
      openAiApiKey,
      openAiModel,
      receiptId,
    });

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Receipt extraction failed.' },
      500
    );
  }
});

async function readReceiptId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    return typeof body.receipt_id === 'string' ? body.receipt_id : null;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}
