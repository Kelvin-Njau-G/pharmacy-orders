import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user,               setUser]               = useState(null)
  const [profile,            setProfile]            = useState(null)
  const [loading,            setLoading]            = useState(true)
  const [assignedFacilities, setAssignedFacilities] = useState([])
  const [activeFacility,     setActiveFacility]     = useState(null)
  const [needsFacilityPick,  setNeedsFacilityPick]  = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted.current) return
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) loadProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted.current) return
        if (event === 'INITIAL_SESSION') return
        setUser(session?.user ?? null)
        if (!session?.user) {
          setProfile(null); setAssignedFacilities([])
          setActiveFacility(null); setNeedsFacilityPick(false)
          setLoading(false)
        } else {
          loadProfile(session.user.id)
        }
      }
    )

    return () => { mounted.current = false; subscription.unsubscribe() }
  }, [])

  async function loadProfile(userId) {
    try {
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', userId).single()
      if (!mounted.current || !prof) return

      // Admins bypass facility logic — they see everything
      if (prof.role === 'admin') {
        setProfile(prof); setNeedsFacilityPick(false); return
      }

      // Staff: resolve facility assignments
      const { data: rows } = await supabase
        .from('staff_facilities')
        .select('facility_id, facilities(id, name)')
        .eq('staff_id', userId)

      const facilities = (rows || []).map(r => r.facilities).filter(Boolean)
      if (!mounted.current) return
      setAssignedFacilities(facilities)

      if (facilities.length === 0) {
        // No staff_facilities rows — legacy: use pharmacy_location
        setProfile(prof)
        setActiveFacility({ id: null, name: prof.pharmacy_location })
        setNeedsFacilityPick(false)
        return
      }

      const lastId  = localStorage.getItem(`af_fac_${userId}`)
      const lastFac = facilities.find(f => f.id === lastId)

      if (facilities.length === 1) {
        const fac = facilities[0]
        setActiveFacility(fac)
        setProfile({ ...prof, pharmacy_location: fac.name })
        setNeedsFacilityPick(false)
      } else if (lastFac) {
        setActiveFacility(lastFac)
        setProfile({ ...prof, pharmacy_location: lastFac.name })
        setNeedsFacilityPick(false)
      } else {
        // Multiple facilities, none previously selected
        setProfile(prof)
        setNeedsFacilityPick(true)
      }
    } catch (err) {
      console.error('[AuthContext] loadProfile:', err)
    }
  }

  function switchFacility(facility) {
    if (!user) return
    setActiveFacility(facility)
    setProfile(prev => prev ? { ...prev, pharmacy_location: facility.name } : prev)
    setNeedsFacilityPick(false)
    if (facility.id) localStorage.setItem(`af_fac_${user.id}`, facility.id)
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }
  async function signOut() {
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      assignedFacilities, activeFacility, needsFacilityPick,
      switchFacility, signIn, signOut,
      mustChangePassword: profile?.must_change_password === true,
      isAdmin: profile?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
