/*
 * Payments for the AVANT public site (avant.school).
 *
 * This codebase is deliberately separate from `functions/`, which belongs to
 * the student and teacher app. They share a Firebase project - and therefore
 * a billing account, a Firestore instance and a functions quota - but nothing
 * here may read or write the app's data, and no deploy of this codebase may
 * redeploy the app's functions.
 *
 *   firebase deploy --only functions:marketing     <- the only safe form
 *   firebase deploy --only functions               <- deploys BOTH codebases
 *   firebase deploy                                <- everything. Never.
 *
 * The plan, the decisions and the reasoning: site/STRIPE-PLAN.md
 *
 * Right now this holds one function and no Stripe code at all. That is on
 * purpose: the first thing to prove is that deploying here leaves the app's
 * 27 functions untouched. If that is not true, nothing else should be built.
 */
const functions = require('firebase-functions')

/**
 * Says what this codebase is and that it is alive. No secrets, no data, no
 * side effects - it is safe to leave in place after the isolation check, and
 * useful as a liveness probe later.
 */
exports.marketingPing = functions.https.onRequest((req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({
    ok: true,
    codebase: 'marketing',
    site: 'avant.school',
    note: 'Public site payments. Holds no student or teacher data.',
    time: new Date().toISOString(),
  })
})
