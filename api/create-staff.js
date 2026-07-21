import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, name, location, role } = req.body || {}
  if (!email || !password || !name || !location || !role) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Service role key bypasses email confirmation and has no rate limit
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Create auth user — email_confirm:true means no email is sent
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })

  if (authErr) return res.status(400).json({ error: authErr.message })

  // Create profile row
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: authData.user.id,
    full_name: name,
    pharmacy_location: location,
    role,
  })

  if (profileErr) return res.status(400).json({ error: profileErr.message })

  return res.status(200).json({ success: true })
}
