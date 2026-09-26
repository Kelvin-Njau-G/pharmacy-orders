import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password, name, facilityIds = [], role } = req.body || {}
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Resolve facility names from IDs (for pharmacy_location fallback)
  let primaryLocation = 'Head Office'
  if (role !== 'admin' && facilityIds.length > 0) {
    const { data: facs } = await supabase
      .from('facilities').select('id, name').in('id', facilityIds)
    primaryLocation = facs?.[0]?.name || 'Head Office'
  }

  // Create auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: name },
  })
  if (authErr) return res.status(400).json({ error: authErr.message })

  // Create profile
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: authData.user.id, full_name: name,
    pharmacy_location: role === 'admin' ? 'Head Office' : primaryLocation,
    role, must_change_password: true,
  })
  if (profileErr) return res.status(400).json({ error: profileErr.message })

  // Insert staff_facilities rows for each assigned facility
  if (role !== 'admin' && facilityIds.length > 0) {
    const rows = facilityIds.map(fid => ({ staff_id: authData.user.id, facility_id: fid }))
    const { error: sfErr } = await supabase.from('staff_facilities').insert(rows)
    if (sfErr) return res.status(400).json({ error: sfErr.message })
  }

  return res.status(200).json({ success: true })
}
