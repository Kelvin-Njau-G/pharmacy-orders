import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId required' })

  // Service role key bypasses RLS — required here because the user's
  // restricted password-reset session cannot update their own profile row
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { error } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', userId)

  if (error) {
    console.error('[clear-password-flag]', error.message)
    return res.status(400).json({ error: error.message })
  }
  return res.status(200).json({ success: true })
}
