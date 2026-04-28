import { supabase } from './supabase';

// ──────────────────────────────────────
//  GIG OPERATIONS
// ──────────────────────────────────────

/**
 * Register a new gig. User becomes the provider.
 * Returns { gig_id, status, message } or { error }.
 */
export async function registerGig(channelId, providerId, clientId) {
  const { data, error } = await supabase.rpc('register_gig', {
    p_channel_id: channelId,
    p_provider_id: providerId,
    p_client_id: clientId,
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Client submits a rating and review.
 * Returns { gig_id, status, new_rating, message } or { error }.
 */
export async function submitReview(gigId, clientId, rating, reviewText = '') {
  const { data, error } = await supabase.rpc('submit_review', {
    p_gig_id: gigId,
    p_client_id: clientId,
    p_rating: rating,
    p_review_text: reviewText,
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Provider cancels a pending gig.
 * Returns { gig_id, status, message } or { error }.
 */
export async function cancelGig(gigId, providerId) {
  const { data, error } = await supabase.rpc('cancel_gig', {
    p_gig_id: gigId,
    p_provider_id: providerId,
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Get the current gig for a conversation.
 * Returns the gig row or null.
 */
export async function getGigForChannel(channelId) {
  const { data, error } = await supabase.rpc('get_gig', {
    p_channel_id: channelId,
  });

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

// ──────────────────────────────────────
//  GIG HISTORY & REVIEWS
// ──────────────────────────────────────

/**
 * Get reviews for a user (as provider).
 * Cursor-paginated by completed_at.
 */
export async function getUserReviews(userId, cursor = null, limit = 20) {
  const { data, error } = await supabase.rpc('get_user_reviews', {
    p_user_id: userId,
    p_cursor: cursor,
    p_limit: limit,
  });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get gig history for a user — either as provider or client.
 * Uses the gigs table directly with RLS.
 */
export async function getGigHistory(userId, role = 'provider', cursor = null, limit = 20) {
  const column = role === 'provider' ? 'provider_id' : 'client_id';
  
  let query = supabase
    .from('gigs')
    .select('id, channel_id, provider_id, client_id, status, rating, review_text, created_at, completed_at, cancelled_at')
    .eq(column, userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data || [];
}

// ──────────────────────────────────────
//  GIG MAINTENANCE
// ──────────────────────────────────────

/**
 * Check for and cancel any expired gigs for a user.
 * Run this whenever the user opens the chat screen or chat list.
 * Returns the number of gigs cancelled.
 */
export async function checkExpiredGigs(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find expired gigs where user is the provider
  const { data: expiredGigs, error } = await supabase
    .from('gigs')
    .select('id')
    .eq('provider_id', userId)
    .eq('status', 'pending_review')
    .lt('created_at', sevenDaysAgo);

  if (error) throw new Error(error.message);
  if (!expiredGigs || expiredGigs.length === 0) return 0;

  // Cancel them
  for (const gig of expiredGigs) {
    await supabase.rpc('cancel_gig', {
      p_gig_id: gig.id,
      p_provider_id: userId,
    });
  }

  return expiredGigs.length;
}

// ──────────────────────────────────────
//  REMINDERS
// ──────────────────────────────────────

/**
 * Check if the client needs a reminder to submit a review.
 * Returns true if > 3 hours since last reminder.
 */
export function shouldSendReminder(gig) {
  if (!gig || gig.status !== 'pending_review') return false;
  if (!gig.last_reminder_at) return true; // never reminded
  
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(gig.last_reminder_at) < threeHoursAgo;
}

/**
 * Update the last reminder timestamp for a gig.
 */
export async function updateReminderSent(gigId) {
  const { error } = await supabase
    .from('gigs')
    .update({ last_reminder_at: new Date().toISOString() })
    .eq('id', gigId);

  if (error) throw new Error(error.message);
}

// ──────────────────────────────────────
//  CREDITS
// ──────────────────────────────────────

/**
 * Get the current user's credit balance.
 * Returns the number of credits.
 */
export async function getCredits(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();

  if (error) throw new Error(error.message);
  return data?.credits ?? 0;
}

/**
 * Get recent people a user has chatted with (last 14 days).
 * Used for the "Register Gig" button on own profile.
 */
export async function getRecentChats(userId, limit = 30) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.rpc('get_chat_list', {
    p_user_id: userId,
    p_limit: limit,
    p_cursor: null,
  });

  if (error) throw new Error(error.message);
  
  // Filter to only chats with activity in the last 14 days
  return (data || []).filter(chat => 
    chat.last_message_at && new Date(chat.last_message_at) > new Date(fourteenDaysAgo)
  );
}

// ──────────────────────────────────────
//  CREDIT PURCHASES
// ──────────────────────────────────────

/**
 * Get purchase history for a user.
 */
export async function getPurchaseHistory(userId) {
  const { data, error } = await supabase
    .from('credit_purchases')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// ──────────────────────────────────────
//  PAYSTACK
// ──────────────────────────────────────

/**
 * Initialize a Paystack payment.
 * Returns the Paystack popup URL or the Paystack object.
 */
export function initializePaystackPayment({ email, amount, reference, onSuccess, onClose }) {
  if (typeof window === 'undefined' || !window.PaystackPop) {
    throw new Error('Paystack script not loaded. Add <script src="https://js.paystack.co/v1/inline.js"></script> to your HTML.');
  }

  const handler = window.PaystackPop.setup({
    key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
    email,
    amount, // in kobo (e.g., 150000 for ₦1,500)
    ref: reference,
    onSuccess: (transaction) => {
      onSuccess(transaction);
    },
    onClose: () => {
      onClose();
    },
  });

  handler.openIframe();
}

/**
 * Verify a Paystack transaction via the reference.
 * Called from the webhook or after checkout to confirm payment.
 */
export async function verifyPaystackTransaction(reference) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_PAYSTACK_SECRET_KEY}`,
      },
    }
  );

  const data = await response.json();
  if (!data.status || data.data.status !== 'success') {
    throw new Error('Payment verification failed');
  }

  return data.data;
}

/**
 * Add credits to a user's profile after successful payment.
 * Also records the purchase in credit_purchases.
 */
export async function addCreditsAfterPurchase(userId, creditsPurchased, amountPaid, paystackReference) {
  // Get current credits
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();

  if (profileError) throw new Error(profileError.message);

  const newBalance = (profile?.credits ?? 0) + creditsPurchased;

  // Update profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits: newBalance })
    .eq('id', userId);

  if (updateError) throw new Error(updateError.message);

  // Record purchase
  const { error: purchaseError } = await supabase
    .from('credit_purchases')
    .insert({
      user_id: userId,
      amount_paid: amountPaid,
      credits_purchased: creditsPurchased,
      paystack_reference: paystackReference,
      status: 'completed',
    });

  if (purchaseError) throw new Error(purchaseError.message);

  return newBalance;
}
